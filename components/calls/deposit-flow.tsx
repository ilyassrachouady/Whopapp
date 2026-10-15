"use client";
import {
  FlowSection,
  ScheduleFields,
  NotesField,
  type FlowProps,
} from "./flow-fields";
export function DepositFlow(props: FlowProps) {
  return (
    <FlowSection title="Deposit & follow-up">
      <label className="call-field full-width">
        Deposit amount (USD)
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          placeholder="e.g. 500"
          value={props.draft.depositAmount}
          onChange={(e) => props.onChange({ depositAmount: e.target.value })}
        />
      </label>
      <ScheduleFields {...props} />
      <p className="summary-disclaimer full-width">
        Set the required follow-up call before creating the one-time deposit
        link.
      </p>
      <NotesField {...props} />
    </FlowSection>
  );
}
