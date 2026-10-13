"use client";
import { unqualifiedReasons } from "@/lib/call-options";
import {
  FlowSection,
  ReasonField,
  NotesField,
  type FlowProps,
} from "./flow-fields";
export function UnqualifiedFlow(props: FlowProps) {
  return (
    <FlowSection title="Qualification details">
      <ReasonField
        label="Reason"
        value={props.draft.lossReason}
        options={unqualifiedReasons}
        onChange={(v) => props.onChange({ lossReason: v })}
      />
      <NotesField {...props} />
    </FlowSection>
  );
}
