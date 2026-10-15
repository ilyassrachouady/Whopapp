"use client";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Loader2,
  Phone,
  CalendarDays,
} from "lucide-react";
import { recordingFromNotes } from "@/lib/recording";
import { Button } from "@/components/ui/button";
import { money, paymentLabels } from "@/lib/config";
import { outcomeLabels, attendanceLabels } from "@/lib/call-options";
import type {
  Attendance,
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
  attendance: Attendance;
  outcome: CallOutcome | null;
  draft: CallDraft;
  checkout: CheckoutSession | null;
  completed: CallRecord | null;
  notesSyncStatus?: string;
  assignmentStatus?: string;
  assignmentBusy?: boolean;
  onRetryAssignment?: () => void;
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
  attendance,
  draft,
  checkout,
  completed,
  notesSyncStatus = "mock",
  assignmentStatus = "mock",
  assignmentBusy = false,
  onRetryAssignment,
  busy,
  error,
  hint,
  onComplete,
  onNext,
}: Props) {
  const active = completed ? completed.outcome : outcome;
  const activeAttendance = completed?.attendance || attendance;
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
  const sale = completed?.outcome === "sold" ? completed : checkout;
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
        <span className="outcome-summary-label">
          {active ? outcomeLabels[active] : attendanceLabels[activeAttendance]}
        </span>
      </div>
      {active === "sold" && sale && (
        <dl className="summary-lines">
          <div>
            <dt>Offer</dt>
            <dd>
              {"metadata" in sale ? sale.metadata.offer_name : sale.offer_name}
            </dd>
          </div>
          <div>
            <dt>Contract value</dt>
            <dd>{money(sale.contract_value!)}</dd>
          </div>
          <div>
            <dt>Payment type</dt>
            <dd>{paymentLabels[sale.payment_type!]}</dd>
          </div>
          <div>
            <dt>Due today</dt>
            <dd>{money(sale.amount_due_today!)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{money(sale.contract_value! - sale.amount_due_today!)}</dd>
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
      {active === "deposit" && (
        <div className="call-summary-details">
          <p>
            <span>Deposit</span>
            {money(
              checkout?.checkout_type === "deposit"
                ? checkout.deposit_amount
                : completed?.deposit_amount || 0,
            )}
          </p>
          <p className="follow-up-date">
            <CalendarDays size={15} />
            {scheduleLabel(date || "", time || "")}
          </p>
          <p>
            <span>Payment status</span>
            {checkout?.status === "paid"
              ? "Payment received"
              : checkout?.status === "failed"
                ? "Payment failed"
                : "Pending payment"}
          </p>
        </div>
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
      {activeAttendance !== "attended" && (
        <div className="call-summary-details">
          {activeAttendance === "cancelled" && (
            <p>
              <span>Cancellation reason</span>
              {completed && "cancellation_reason" in completed
                ? completed.cancellation_reason
                : draft.cancellationReason || "Select a reason"}
            </p>
          )}
          {activeAttendance !== "rescheduled" && (
            <p>
              <span>Follow-up required</span>
              {(
                completed && "follow_up_required" in completed
                  ? completed.follow_up_required
                  : draft.followUpRequired
              )
                ? "Yes"
                : "No"}
            </p>
          )}
          {(activeAttendance === "rescheduled" ||
            (completed && "follow_up_required" in completed
              ? completed.follow_up_required
              : draft.followUpRequired)) && (
            <p className="follow-up-date">
              <CalendarDays size={15} />
              {scheduleLabel(date || "", time || "")}
            </p>
          )}
        </div>
      )}
      {completed && recordingFromNotes(completed.notes) && (
        <a
          className="crm-open"
          href={recordingFromNotes(completed.notes)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open call recording
        </a>
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
            {assignmentStatus === "synced"
              ? "GHL contact assignment synced"
              : assignmentStatus === "failed"
                ? "GHL assignment needs attention"
                : assignmentStatus === "unchanged"
                  ? "GHL owner unchanged"
                  : "Call report saved"}
          </div>
          <p className="summary-disclaimer">
            {assignmentStatus === "mock"
              ? "No CRM update was sent."
              : assignmentStatus === "unchanged"
                ? "External closer name saved. Existing GHL owner kept."
                : assignmentStatus === "failed"
                  ? "Your report is saved. Retry to update contact ownership."
                  : "The selected closer is now the contact’s assigned GHL user. Call report saved in Payment Desk."}
          </p>
          {notesSyncStatus !== "mock" && (
            <p
              className={notesSyncStatus === "failed" ? "error" : "crm-ready"}
              role="status"
            >
              {notesSyncStatus === "synced"
                ? "Call report synced to GHL notes."
                : "Call saved. GHL notes need a retry."}
            </p>
          )}
          {(assignmentStatus === "failed" || notesSyncStatus === "failed") && (
            <Button disabled={assignmentBusy} onClick={onRetryAssignment}>
              {assignmentBusy ? "Retrying…" : "Retry GHL sync"}
            </Button>
          )}
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
