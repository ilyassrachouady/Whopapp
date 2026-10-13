"use client";
import { noSaleReasons } from "@/lib/call-options";
import {
  FlowSection,
  ReasonField,
  NotesField,
  type FlowProps,
} from "./flow-fields";
export function NoSaleFlow(props: FlowProps) {
  return (
    <FlowSection title="No sale details">
      <ReasonField
        label="Reason"
        value={props.draft.lossReason}
        options={noSaleReasons}
        onChange={(v) => props.onChange({ lossReason: v })}
      />
      <NotesField {...props} />
    </FlowSection>
  );
}
