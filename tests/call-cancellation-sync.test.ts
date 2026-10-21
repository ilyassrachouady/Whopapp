import test from "node:test";
import assert from "node:assert/strict";
import { syncCallAppointment } from "../lib/call-appointment-sync";
import type { CallRecord } from "../lib/types";
test("cancellation updates the existing event without moving its dates, verifies status, and retries without another write", async () => {
  const keys = [
      "GHL_MODE",
      "GHL_WRITES_ENABLED",
      "GHL_API_KEY",
      "GHL_LOCATION_ID",
      "GHL_ADVISORY_CALENDAR_ID",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    saved = keys.map((k) => process.env[k]),
    originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    GHL_MODE: "real",
    GHL_WRITES_ENABLED: "true",
    GHL_API_KEY: "test",
    GHL_LOCATION_ID: "location",
    GHL_ADVISORY_CALENDAR_ID: "calendar",
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let event = {
      id: "event",
      locationId: "location",
      calendarId: "calendar",
      contactId: "contact",
      startTime: "2030-01-01T10:00:00Z",
      endTime: "2030-01-01T10:45:00Z",
      appointmentStatus: "confirmed",
    },
    writes = 0,
    deny = false,
    wrongReadback = false;
  const record = {
    id: "report",
    call_id: "desk_test",
    appointment_id: "event",
    ghl_contact_id: "contact",
    attendance: "cancelled",
    outcome: null,
    follow_up_required: false,
  } as CallRecord;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === "/contacts/contact")
      return Response.json({
        contact: { id: "contact", locationId: "location" },
      });
    if (path === "/calendars/calendar")
      return Response.json({
        calendar: {
          id: "calendar",
          locationId: "location",
          isActive: true,
          allowCancellation: true,
          allowReschedule: false,
        },
      });
    if (path === "/contacts/contact/appointments")
      return Response.json({ events: [event, { ...event, id: "other" }] });
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      assert.deepEqual(body, {
        appointmentStatus: "cancelled",
        toNotify: true,
      });
      writes++;
      if (deny) return Response.json({}, { status: 403 });
      if (!wrongReadback)
        event = { ...event, appointmentStatus: body.appointmentStatus };
      return Response.json({ appointment: event });
    }
    if (path === "/calendars/events/appointments/event")
      return Response.json({ appointment: event });
    throw Error(`Unexpected request: ${path}`);
  };
  try {
    const result = await syncCallAppointment({ ...record });
    assert.equal(result.status, "synced");
    assert.match(result.message || "", /cancelled/);
    assert.equal(writes, 1);
    assert.equal(event.startTime, "2030-01-01T10:00:00Z");
    assert.equal((await syncCallAppointment({ ...record })).status, "synced");
    assert.equal(writes, 1);
    event = { ...event, contactId: "wrong", appointmentStatus: "confirmed" };
    assert.equal((await syncCallAppointment({ ...record })).status, "failed");
    assert.equal(writes, 1);
    event = { ...event, contactId: "contact" };
    assert.equal(
      (await syncCallAppointment({ ...record, appointment_id: "desk_test" }))
        .status,
      "failed",
    );
    assert.equal(writes, 1);
    deny = true;
    assert.match(
      (await syncCallAppointment({ ...record })).message || "",
      /calendars\/events.write/,
    );
    assert.equal(event.appointmentStatus, "confirmed");
    deny = false;
    wrongReadback = true;
    assert.match(
      (await syncCallAppointment({ ...record })).message || "",
      /could not be verified/,
    );
    const count = writes;
    assert.equal(
      (
        await syncCallAppointment({
          ...record,
          attendance: "no_show",
        } as CallRecord)
      ).status,
      "not_required",
    );
    assert.equal(writes, count);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});
