"use client";
import type { Attendance } from "@/lib/types";
import { cancellationReasons } from "@/lib/call-options";
import {
  FlowSection,
  ScheduleFields,
  NotesField,
  ReasonField,
  type FlowProps,
} from "./flow-fields";
export function AttendanceDetails({
  attendance,
  ...props
}: FlowProps & { attendance: Exclude<Attendance, "attended"> }) {
  return (
    <FlowSection
      step="03"
      title={
        attendance === "rescheduled"
          ? "Reschedule details"
          : attendance === "cancelled"
            ? "Cancellation details"
            : "No show details"
      }
    >
      {attendance === "cancelled" && (
        <ReasonField
          label="Cancellation reason"
          value={props.draft.cancellationReason}
          options={cancellationReasons}
          onChange={(value) => props.onChange({ cancellationReason: value })}
        />
      )}
      {attendance !== "rescheduled" && (
        <div className="call-field full-width">
          <span>Follow-up required</span>
          <div
            className="reschedule-options"
            role="group"
            aria-label="Follow-up required"
          >
            {[true, false].map((value) => (
              <button
                type="button"
                key={String(value)}
                aria-pressed={props.draft.followUpRequired === value}
                className={`payment-option ${props.draft.followUpRequired === value ? "selected" : ""}`}
                onClick={() => props.onChange({ followUpRequired: value })}
              >
                {value ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      )}
      {(attendance === "rescheduled" || props.draft.followUpRequired) && (
        <ScheduleFields {...props} rescheduled={attendance === "rescheduled"} />
      )}
      <NotesField {...props} />
    </FlowSection>
  );
}
