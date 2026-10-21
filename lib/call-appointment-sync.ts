import "server-only";
import { z } from "zod";
import { getContact, ghlMode, request } from "./ghl";
import { resolveSchedule } from "./call-validation";
import { getSupabase } from "./supabase";
import type { CallRecord } from "./types";

const eventSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  calendarId: z.string(),
  contactId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  appointmentStatus: z.string(),
  isRecurring: z.boolean().optional(),
  rrule: z.string().nullish(),
});
const active = (s: string) =>
  ["new", "confirmed", "active"].includes(s.toLowerCase());
export async function rescheduleCallAppointment(record: CallRecord) {
  if (record.attendance !== "rescheduled" && record.attendance !== "cancelled")
    return { status: "not_required" as const };
  const cancelling = record.attendance === "cancelled";
  if (ghlMode() !== "real") return { status: "mock" as const };
  if (process.env.GHL_WRITES_ENABLED !== "true")
    throw new Error("GHL writes are disabled. No appointment update was sent.");
  const calendarId =
    process.env.GHL_ADVISORY_CALENDAR_ID || "W8BVoDU02Ez8uAbOnGHR";
  const contact = await getContact(record.ghl_contact_id);
  if (!contact || !("locationId" in contact))
    throw new Error("A verified GHL contact is required.");
  const calendar = (
    await request(`/calendars/${encodeURIComponent(calendarId)}`)
  ).calendar;
  if (
    calendar?.locationId !== process.env.GHL_LOCATION_ID ||
    calendar?.id !== calendarId ||
    calendar?.isActive === false ||
    (cancelling
      ? calendar?.allowCancellation === false
      : calendar?.allowReschedule === false)
  )
    throw new Error(
      "Advisory Call calendar cannot be verified or does not allow this change.",
    );
  let target = 0;
  if (!cancelling) {
    if (!record.follow_up_date || !record.follow_up_time || !record.time_zone)
      throw new Error("Choose a new date, time and time zone.");
    const schedule = resolveSchedule(
      {
        follow_up_date: record.follow_up_date,
        follow_up_time: record.follow_up_time,
        time_zone: record.time_zone,
      },
      0,
    );
    target = Date.parse(schedule.follow_up_at);
  }
  let id = record.appointment_id;
  // Desk-generated call references are not GHL event IDs.
  if (!id || id.startsWith("desk_") || id.startsWith("appt_")) {
    const body = await request(
      `/contacts/${encodeURIComponent(record.ghl_contact_id)}/appointments`,
    );
    const events = z.array(eventSchema).parse(body.events);
    const candidates = events.filter(
      (e) =>
        e.locationId === process.env.GHL_LOCATION_ID &&
        e.calendarId === calendarId &&
        e.contactId === record.ghl_contact_id &&
        active(e.appointmentStatus),
    );
    if (candidates.length !== 1)
      throw new Error(
        candidates.length
          ? "Multiple active Advisory Call appointments found. Change the intended appointment in GHL; no appointment was changed here."
          : "No active Advisory Call appointment found for this contact. Book one in GHL first.",
      );
    id = candidates[0].id;
  }
  const read = async () => {
    const body = await request(
      `/calendars/events/appointments/${encodeURIComponent(id)}`,
    );
    return eventSchema.parse(body.appointment || body.event);
  };
  const event = await read();
  if (
    event.id !== id ||
    event.locationId !== process.env.GHL_LOCATION_ID ||
    event.calendarId !== calendarId ||
    event.contactId !== record.ghl_contact_id
  )
    throw new Error(
      "Appointment does not belong to this contact and Advisory Call calendar.",
    );
  if (event.isRecurring || event.rrule)
    throw new Error(
      "Recurring appointments must be changed in GHL to avoid changing the series.",
    );
  if (cancelling && event.appointmentStatus.toLowerCase() === "cancelled")
    return {
      status: "synced" as const,
      appointmentId: id,
      message: "GHL appointment is already cancelled.",
    };
  if (!active(event.appointmentStatus))
    throw new Error(
      "This appointment is no longer active. Check the booking in GHL.",
    );
  const duration = Date.parse(event.endTime) - Date.parse(event.startTime);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000)
    throw new Error("Appointment duration could not be verified.");
  if (!cancelling && Date.parse(event.startTime) === target)
    return {
      status: "synced" as const,
      appointmentId: id,
      startTime: event.startTime,
      message: "GHL appointment is already at the requested time.",
    };
  if (!cancelling && target <= Date.now())
    throw new Error("Choose a future appointment time.");
  // Save the chosen identity before the external write so a retry cannot select a different event.
  const db = getSupabase();
  if (db) {
    const latest = await db
      .from("call_records")
      .select("id")
      .eq("ghl_contact_id", record.ghl_contact_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .single();
    if (latest.error || latest.data.id !== record.id)
      throw new Error(
        "A newer call report exists. Check the current appointment in GHL instead of retrying this older report.",
      );
    const saved = await db
      .from("call_records")
      .update({ appointment_id: id })
      .eq("id", record.id);
    if (saved.error)
      throw new Error(
        "Could not save the appointment reference. No calendar update was sent.",
      );
  }
  record.appointment_id = id;
  const end = cancelling
    ? event.endTime
    : new Date(target + duration).toISOString();
  try {
    await request(
      `/calendars/events/appointments/${encodeURIComponent(id)}`,
      "PUT",
      cancelling
        ? { appointmentStatus: "cancelled", toNotify: true }
        : {
            startTime: new Date(target).toISOString(),
            endTime: end,
            appointmentStatus: "confirmed",
            ignoreDateRange: false,
            ignoreFreeSlotValidation: false,
            toNotify: true,
          },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/\(403\)/.test(message))
      throw new Error(
        "GHL calendar write permission is missing. Enable calendars/events.write on the integration key.",
      );
    if (/\((400|409|422)\)/.test(message) && !cancelling)
      throw new Error(
        "GHL rejected the new time. Choose an available Advisory Call slot within the calendar’s booking rules.",
      );
    throw e;
  }
  const verified = await read();
  if (
    verified.contactId !== record.ghl_contact_id ||
    verified.locationId !== process.env.GHL_LOCATION_ID ||
    verified.calendarId !== calendarId ||
    (cancelling
      ? verified.appointmentStatus.toLowerCase() !== "cancelled" ||
        Date.parse(verified.startTime) !== Date.parse(event.startTime) ||
        Date.parse(verified.endTime) !== Date.parse(event.endTime)
      : Date.parse(verified.startTime) !== target ||
        Date.parse(verified.endTime) !== target + duration)
  )
    throw new Error(
      "GHL calendar update could not be verified. Check the appointment or retry sync.",
    );
  return {
    status: "synced" as const,
    appointmentId: id,
    startTime: verified.startTime,
    message: cancelling
      ? "Advisory Call appointment cancelled in GHL."
      : "Advisory Call appointment rescheduled in GHL.",
  };
}
export async function syncCallAppointment(record: CallRecord) {
  try {
    return await rescheduleCallAppointment(record);
  } catch (e) {
    return {
      status: "failed" as const,
      message:
        e instanceof Error
          ? e.message
          : "Could not verify the GHL appointment update. Retry sync.",
    };
  }
}
