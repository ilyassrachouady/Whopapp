"use client";
import {
  FlowSection,
  ScheduleFields,
  NotesField,
  type FlowProps,
} from "./flow-fields";
export function NoShowFlow(props: FlowProps) {
  return (
    <FlowSection title="No show details">
      <div className="call-field full-width">
        <span>Reschedule needed</span>
        <div
          className="reschedule-options"
          role="group"
          aria-label="Reschedule needed"
        >
          {[true, false].map((value) => (
            <button
              type="button"
              key={String(value)}
              aria-pressed={props.draft.rescheduleNeeded === value}
              className={`payment-option ${props.draft.rescheduleNeeded === value ? "selected" : ""}`}
              onClick={() => props.onChange({ rescheduleNeeded: value })}
            >
              {value ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
      {props.draft.rescheduleNeeded && <ScheduleFields {...props} />}
      <NotesField {...props} />
    </FlowSection>
  );
}
