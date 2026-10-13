"use client";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Loader2,
  Phone,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, paymentLabels } from "@/lib/config";
import { outcomeLabels } from "@/lib/call-options";
import type {
  CallDraft,
  CallOutcome,
  CallRecord,
  CheckoutSession,
  Closer,
  Prospect,
} from "@/lib/types";
interface Props {
  prospect: Prospect;
  closer: Closer;
  outcome: CallOutcome;
  draft: CallDraft;
  checkout: CheckoutSession | null;
  completed: CallRecord | null;
  busy: boolean;
  error: string;
  hint: string;
  onComplete: () => void;
  onNext: () => void;
}
function scheduleLabel(date: string, time: string) {
  if (!date || !time) return "Select a date and time";
  const value = new Date(`${date}T${time}`);
  if (!Number.isFinite(value.getTime())) return "Check the date and time";
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(value)} at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(value)}`;
}
export function CallSummary({
  prospect,
  closer,
  outcome,
  draft,
  checkout,
  completed,
  busy,
  error,
  hint,
  onComplete,
  onNext,
}: Props) {
  const active = completed?.call_outcome || outcome;
  const date =
    completed && "follow_up_date" in completed
      ? completed.follow_up_date
      : draft.followUpDate;
  const time =
    completed && "follow_up_time" in completed
      ? completed.follow_up_time
      : draft.followUpTime;
  const reason =
    completed && "loss_reason" in completed
      ? completed.loss_reason
      : completed && "follow_up_reason" in completed
        ? completed.follow_up_reason
        : active === "follow_up"
          ? draft.followUpReason
          : draft.lossReason;
  const sale = completed?.call_outcome === "sold" ? completed : checkout;
  return (
    <section
      className={`summary-card call-summary ${completed ? "call-completed" : ""}`}
      aria-live="polite"
    >
      <div className="card-eyebrow">
        {completed ? "CALL COMPLETED" : "CALL SUMMARY"}
        {completed ? <CircleCheck size={18} /> : <Phone size={16} />}
      </div>
      <div className="summary-offer">
        <h3>{completed?.prospect_name || prospect.full_name}</h3>
        <span className="outcome-summary-label">{outcomeLabels[active]}</span>
      </div>
      {active === "sold" && sale && (
        <dl className="summary-lines">
          <div>
            <dt>Offer</dt>
            <dd>
              {"offer_name" in sale
                ? sale.offer_name
                : sale.metadata.offer_name}
            </dd>
          </div>
          <div>
            <dt>Contract value</dt>
            <dd>{money(sale.contract_value)}</dd>
          </div>
          <div>
            <dt>Payment type</dt>
            <dd>{paymentLabels[sale.payment_type]}</dd>
          </div>
          <div>
            <dt>Due today</dt>
            <dd>{money(sale.amount_due_today)}</dd>
          </div>
          <div className="link-status">
            <dt>Payment link</dt>
            <dd>
              <Check size={13} />
              Generated
            </dd>
          </div>
        </dl>
      )}
      {active === "follow_up" && (
        <div className="call-summary-details">
          <p className="follow-up-date">
            <CalendarDays size={15} />
            {scheduleLabel(date || "", time || "")}
          </p>
          <p>
            <span>Reason</span>
            {reason || "Select a reason"}
          </p>
          <p>
            <span>Next step</span>
            {completed && "next_step" in completed
              ? completed.next_step
              : draft.nextStep || "Add a next step"}
          </p>
          <small>
            Scheduled in{" "}
            {completed && "time_zone" in completed
              ? completed.time_zone
              : "your local time zone"}
          </small>
        </div>
      )}
      {(active === "no_sale" || active === "unqualified") && (
        <div className="call-summary-details">
          <p>
            <span>Reason</span>
            {reason || "Select a reason"}
          </p>
        </div>
      )}
      {active === "no_show" && (
        <div className="call-summary-details">
          <p>
            <span>Reschedule</span>
            {(
              completed && "reschedule_needed" in completed
                ? completed.reschedule_needed
                : draft.rescheduleNeeded
            )
              ? "Needed"
              : "Not needed"}
          </p>
          {(completed && "reschedule_needed" in completed
            ? completed.reschedule_needed
            : draft.rescheduleNeeded) && (
            <p className="follow-up-date">
              <CalendarDays size={15} />
              {scheduleLabel(date || "", time || "")}
            </p>
          )}
        </div>
      )}
      <div className="summary-closer">
        <span>Closer</span>
        <span className="avatar tiny">{closer.initials}</span>
        <strong>{completed?.closer_name || closer.name}</strong>
      </div>
      {completed ? (
        <>
          <div className="crm-ready">
            <Check size={14} />
            CRM ready to sync
          </div>
          <p className="summary-disclaimer">
            Saved in mock mode. No CRM update was sent.
          </p>
          <Button className="generate-button next-call-button" onClick={onNext}>
            Start next call
            <ArrowRight size={16} />
          </Button>
        </>
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button
            size="lg"
            className="generate-button"
            disabled={busy || Boolean(hint)}
            onClick={onComplete}
          >
            {busy ? (
              <>
                <Loader2 className="spin" size={16} />
                Completing call…
              </>
            ) : (
              <>
                Complete call
                <Check size={16} />
              </>
            )}
          </Button>
          <p className="summary-disclaimer">
            {hint || "One submission. All call details saved together."}
          </p>
          {active === "sold" && (
            <p className="cash-note">
              Due today is not cash collected. Payment is confirmed separately.
            </p>
          )}
        </>
      )}
    </section>
  );
}
