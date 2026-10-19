import "server-only";
import { ensureContactCallNote } from "./ghl";
import { attendanceLabels, outcomeLabels } from "./call-options";
import type { CallRecord } from "./types";

function callReportMarker(record: CallRecord) {
  return `Payment Desk report reference: ${record.id}:${record.created_at}`;
}

export function callNoteBody(record: CallRecord) {
  return [
    "Payment Desk — Call report",
    `Attendance: ${attendanceLabels[record.attendance]}`,
    record.outcome ? `Outcome: ${outcomeLabels[record.outcome]}` : "",
    `Closer: ${record.closer_name}`,
    `Recorded: ${record.created_at}`,
    record.outcome === "sold" || record.outcome === "deposit"
      ? "Payment status: tracked separately through Whop confirmation."
      : "",
    "loss_reason" in record ? `Reason: ${record.loss_reason}` : "",
    "follow_up_reason" in record
      ? `Follow-up reason: ${record.follow_up_reason}`
      : "",
    "cancellation_reason" in record
      ? `Cancellation reason: ${record.cancellation_reason}`
      : "",
    record.follow_up_at
      ? `Follow-up: ${record.follow_up_at} (${record.time_zone || "UTC"})`
      : "",
    "next_step" in record && record.next_step
      ? `Next step: ${record.next_step}`
      : "",
    record.notes ? `\nCall notes:\n${record.notes}` : "",
    `\n${callReportMarker(record)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function syncCallNotes(record: CallRecord) {
  try {
    return await ensureContactCallNote(
      record.ghl_contact_id,
      callReportMarker(record),
      callNoteBody(record),
    );
  } catch {
    return {
      status: "failed" as const,
      message:
        "Call report saved, but the GHL note could not be confirmed. Retry GHL sync.",
    };
  }
}
