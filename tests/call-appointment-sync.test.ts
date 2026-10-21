import test from "node:test";
import assert from "node:assert/strict";
import {
  rescheduleCallAppointment,
  syncCallAppointment,
} from "../lib/call-appointment-sync";
import type { CallRecord } from "../lib/types";

test("rescheduling verifies ownership, preserves duration, enforces GHL availability and retries without another write", async () => {
  const keys = [
    "GHL_MODE",
    "GHL_WRITES_ENABLED",
    "GHL_API_KEY",
    "GHL_LOCATION_ID",
    "GHL_ADVISORY_CALENDAR_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const saved = keys.map((k) => process.env[k]),
    fetchBefore = globalThis.fetch;
  Object.assign(process.env, {
    GHL_MODE: "real",
    GHL_WRITES_ENABLED: "true",
    GHL_API_KEY: "test",
    GHL_LOCATION_ID: "location",
    GHL_ADVISORY_CALENDAR_ID: "calendar",
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const original = {
    id: "event",
    contactId: "contact",
    locationId: "location",
    calendarId: "calendar",
    startTime: "2030-06-11T09:00:00Z",
    endTime: "2030-06-11T09:45:00Z",
    appointmentStatus: "confirmed",
    assignedUserId: "host",
  };
  let event = { ...original },
    list = [event],
    writes = 0,
    conflict = false,
    badReadback = false;
  const record = {
    id: "report",
    call_id: "desk_test",
    appointment_id: "event",
    ghl_contact_id: "contact",
    attendance: "rescheduled",
    outcome: null,
    follow_up_date: "2030-06-12",
    follow_up_time: "10:00",
    time_zone: "Europe/London",
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
          allowReschedule: true,
        },
      });
    if (path === "/contacts/contact/appointments")
      return Response.json({ events: list });
    if (options?.method === "PUT") {
      writes++;
      const body = JSON.parse(String(options.body));
      assert.equal(body.ignoreFreeSlotValidation, false);
      assert.equal(body.ignoreDateRange, false);
      assert.equal(body.toNotify, true);
      assert.equal(body.startTime, "2030-06-12T09:00:00.000Z");
      assert.equal(body.endTime, "2030-06-12T09:45:00.000Z");
      assert.equal(body.assignedUserId, undefined);
      assert.equal(body.contactId, undefined);
      assert.equal(body.calendarId, undefined);
      if (conflict)
        return Response.json({ message: "Not available" }, { status: 400 });
      if (!badReadback) event = { ...event, ...body };
      return Response.json(event);
    }
    if (path === "/calendars/events/appointments/event")
      return Response.json({ appointment: event });
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    assert.equal(
      (await rescheduleCallAppointment({ ...record })).status,
      "synced",
    );
    assert.equal(writes, 1);
    assert.equal(
      (await rescheduleCallAppointment({ ...record })).status,
      "synced",
    );
    assert.equal(writes, 1);
    event = { ...original, contactId: "other" };
    await assert.rejects(
      rescheduleCallAppointment({ ...record }),
      /does not belong/,
    );
    assert.equal(writes, 1);
    event = { ...original };
    list = [event, { ...event, id: "second" }];
    await assert.rejects(
      rescheduleCallAppointment({ ...record, appointment_id: "desk_test" }),
      /Multiple active/,
    );
    assert.equal(writes, 1);
    list = [];
    await assert.rejects(
      rescheduleCallAppointment({ ...record, appointment_id: "desk_test" }),
      /No active/,
    );
    assert.equal(writes, 1);
    list = [event];
    assert.equal(
      (
        await rescheduleCallAppointment({
          ...record,
          appointment_id: "desk_test",
        })
      ).status,
      "synced",
    );
    assert.equal(writes, 2);
    event = { ...original };
    conflict = true;
    assert.equal((await syncCallAppointment({ ...record })).status, "failed");
    assert.equal(event.startTime, original.startTime);
    conflict = false;
    badReadback = true;
    await assert.rejects(
      rescheduleCallAppointment({ ...record }),
      /could not be verified/,
    );
    event = { ...original, appointmentStatus: "cancelled" };
    await assert.rejects(
      rescheduleCallAppointment({ ...record }),
      /no longer active/,
    );
    event = { ...original, isRecurring: true } as typeof original;
    await assert.rejects(rescheduleCallAppointment({ ...record }), /Recurring/);
    const count = writes;
    assert.equal(
      (
        await rescheduleCallAppointment({
          ...record,
          attendance: "attended",
        } as CallRecord)
      ).status,
      "not_required",
    );
    assert.equal(writes, count);
    process.env.GHL_WRITES_ENABLED = "false";
    await assert.rejects(
      rescheduleCallAppointment({ ...record }),
      /writes are disabled/,
    );
    assert.equal(writes, count);
  } finally {
    globalThis.fetch = fetchBefore;
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});
