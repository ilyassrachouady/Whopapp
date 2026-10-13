"use client";
import { followUpReasons } from "@/lib/call-options";
import {
  FlowSection,
  ScheduleFields,
  ReasonField,
  NotesField,
  type FlowProps,
} from "./flow-fields";
export function FollowUpFlow(props: FlowProps) {
  return (
    <FlowSection title="Plan the follow-up">
      <ScheduleFields {...props} />
      <ReasonField
        label="Follow-up reason"
        value={props.draft.followUpReason}
        options={followUpReasons}
        onChange={(v) => props.onChange({ followUpReason: v })}
      />
      <label className="call-field full-width">
        Next step
        <input
          value={props.draft.nextStep}
          maxLength={1000}
          placeholder="e.g. Call after they speak with their partner"
          onChange={(e) => props.onChange({ nextStep: e.target.value })}
        />
      </label>
      <NotesField {...props} />
    </FlowSection>
  );
}
