"use client";
import type { CallDraft } from "@/lib/types";
import { Select } from "@/components/ui/select";
export interface FlowProps {
  draft: CallDraft;
  onChange: (patch: Partial<CallDraft>) => void;
}
export function NotesField({ draft, onChange }: FlowProps) {
  return (
    <label className="call-field full-width">
      Notes <span className="optional-label">Optional</span>
      <textarea
        rows={3}
        maxLength={4000}
        value={draft.notes}
        placeholder="Anything useful for the next conversation…"
        onChange={(e) => onChange({ notes: e.target.value })}
      />
    </label>
  );
}
export function ScheduleFields({
  draft,
  onChange,
  rescheduled = false,
}: FlowProps & { rescheduled?: boolean }) {
  return (
    <>
      <label className="call-field">
        {rescheduled ? "New date" : "Follow-up date"}
        <input
          type="date"
          required
          value={draft.followUpDate}
          onChange={(e) => onChange({ followUpDate: e.target.value })}
        />
      </label>
      <label className="call-field">
        {rescheduled ? "New time" : "Follow-up time"}
        <input
          type="time"
          required
          value={draft.followUpTime}
          onChange={(e) => onChange({ followUpTime: e.target.value })}
        />
      </label>
    </>
  );
}
export function ReasonField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="call-field full-width">
      {label}
      <Select
        label={label}
        value={value}
        onValueChange={onChange}
        placeholder="Select a reason"
        options={options.map((reason) => ({ value: reason, label: reason }))}
      />
    </label>
  );
}
export function FlowSection({
  title,
  children,
  step = "04",
}: {
  title: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section call-details">
      <div className="section-heading">
        <span className="step">{step}</span>
        <h2>{title}</h2>
      </div>
      <div className="call-fields">{children}</div>
    </section>
  );
}
