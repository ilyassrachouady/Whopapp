"use client";
import {
  Check,
  Clock3,
  CircleX,
  CalendarX2,
  UserRoundMinus,
  type LucideIcon,
} from "lucide-react";
import { outcomeLabels } from "@/lib/call-options";
import type { CallOutcome } from "@/lib/types";
const icons: Record<CallOutcome, LucideIcon> = {
  sold: Check,
  follow_up: Clock3,
  no_sale: CircleX,
  no_show: CalendarX2,
  unqualified: UserRoundMinus,
};
export function CallOutcomeSelector({
  value,
  onChange,
}: {
  value: CallOutcome | null;
  onChange: (value: CallOutcome) => void;
}) {
  return (
    <section className="form-section outcome-section">
      <div className="section-heading">
        <span className="step">02</span>
        <h2>Call outcome</h2>
      </div>
      <div className="outcome-options" role="group" aria-label="Call outcome">
        {(Object.keys(outcomeLabels) as CallOutcome[]).map((outcome) => {
          const Icon = icons[outcome];
          return (
            <button
              type="button"
              key={outcome}
              aria-pressed={value === outcome}
              className={`outcome-option ${value === outcome ? "selected" : ""}`}
              onClick={() => onChange(outcome)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{outcomeLabels[outcome]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
