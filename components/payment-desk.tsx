"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  ExternalLink,
  Fingerprint,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  ContactRound,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { closers, money, offers, paymentLabels, prospects } from "@/lib/config";
import { calculatePlan } from "@/lib/payments";
import type { CheckoutSession, CustomPlan, PaymentType } from "@/lib/types";
import { CallOutcomeSelector } from "./calls/call-outcome-selector";
import { SoldFlow } from "./calls/sold-flow";
import { FollowUpFlow } from "./calls/follow-up-flow";
import { NoSaleFlow } from "./calls/no-sale-flow";
import { NoShowFlow } from "./calls/no-show-flow";
import { UnqualifiedFlow } from "./calls/unqualified-flow";
import { NotesField } from "./calls/flow-fields";
import { CallSummary } from "./calls/call-summary";
import { emptyCallDraft, schedulePayload } from "@/lib/call-options";
import { completeCallSchema, resolveSchedule } from "@/lib/call-validation";
import type {
  CallDraft,
  CallOutcome,
  CallRecord,
  CompleteCallInput,
} from "@/lib/types";
export default function PaymentDesk({
  whopMode,
  ghlMode,
}: {
  whopMode: string;
  ghlMode: string;
}) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [draft, setDraft] = useState<CallDraft>(emptyCallDraft);
  const [completed, setCompleted] = useState<CallRecord | null>(null);
  const [completing, setCompleting] = useState(false);
  const [callError, setCallError] = useState("");
  const submitting = useRef(false);
  const generating = useRef(false);
  const [prospectId, setProspectId] = useState("john"),
    [offerId, setOfferId] = useState("coaching"),
    [closerId, setCloserId] = useState("lewis"),
    [paymentType, setPaymentType] = useState<PaymentType>("pif");
  const [custom, setCustom] = useState<CustomPlan>({
    dueToday: 99700,
    remainingPayments: 2,
    futureAmount: 50000,
    firstDate: "",
  });
  const [tracking, setTracking] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<CheckoutSession | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const prospect = prospects.find((p) => p.id === prospectId)!,
    offer = offers.find((o) => o.id === offerId)!,
    closer = closers.find((c) => c.id === closerId)!;
  let plan;
  let planError = "";
  try {
    plan = calculatePlan(offer.price, paymentType, custom);
  } catch (e) {
    planError = (e as Error).message;
  }
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  const change = () => {
    setResult(null);
    setError("");
    setCallError("");
  };
  function updateDraft(patch: Partial<CallDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setCallError("");
  }
  function callInput(): CompleteCallInput {
    const base = { prospectId, closerId, notes: draft.notes };
    if (outcome === "sold") {
      if (!result) throw new Error("Generate a payment link first.");
      return { ...base, call_outcome: "sold", checkout_session_id: result.id };
    }
    if (outcome === "follow_up") {
      if (!draft.followUpDate || !draft.followUpTime)
        throw new Error("Choose a follow-up date and time.");
      if (!draft.followUpReason) throw new Error("Select a follow-up reason.");
      if (!draft.nextStep.trim()) throw new Error("Add the next step.");
      return {
        ...base,
        call_outcome: "follow_up",
        ...schedulePayload(draft),
        follow_up_reason: draft.followUpReason,
        next_step: draft.nextStep,
      };
    }
    if (outcome === "no_show") {
      if (
        draft.rescheduleNeeded &&
        (!draft.followUpDate || !draft.followUpTime)
      )
        throw new Error("Choose a follow-up date and time.");
      return {
        ...base,
        call_outcome: "no_show",
        reschedule_needed: draft.rescheduleNeeded,
        ...(draft.rescheduleNeeded ? schedulePayload(draft) : {}),
      };
    }
    if (outcome === "no_sale" || outcome === "unqualified") {
      if (!draft.lossReason) throw new Error("Select a reason.");
      return { ...base, call_outcome: outcome, loss_reason: draft.lossReason };
    }
    throw new Error("Select a call outcome.");
  }
  let completionHint = "";
  try {
    const input = completeCallSchema.parse(callInput());
    if (
      input.call_outcome === "follow_up" ||
      (input.call_outcome === "no_show" && input.reschedule_needed)
    )
      resolveSchedule(input);
  } catch (e) {
    completionHint = e instanceof Error ? e.message : "Check the call details.";
  }
  async function submitCall() {
    if (submitting.current || completed) return;
    submitting.current = true;
    setCompleting(true);
    setCallError("");
    try {
      const response = await fetch("/api/calls/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callInput()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const record: CallRecord = data.record;
      setCompleted(record);
      setOutcome(record.call_outcome);
      setCloserId(record.closer_id);
      setDraft({
        ...emptyCallDraft(),
        notes: record.notes,
        ...("loss_reason" in record ? { lossReason: record.loss_reason } : {}),
        ...("follow_up_date" in record
          ? {
              followUpDate: record.follow_up_date || "",
              followUpTime: record.follow_up_time || "",
            }
          : {}),
        ...("follow_up_reason" in record
          ? {
              followUpReason: record.follow_up_reason,
              nextStep: record.next_step,
            }
          : {}),
        ...("reschedule_needed" in record
          ? { rescheduleNeeded: record.reschedule_needed }
          : {}),
      });
      if (data.checkout) {
        setResult({
          ...data.checkout,
          checkout_url: new URL(
            data.checkout.checkout_url,
            window.location.origin,
          ).href,
        });
        setOfferId(data.checkout.offer_id);
        setPaymentType(data.checkout.payment_type);
      } else setResult(null);
      notify(
        data.duplicate
          ? "This call was already completed. Your saved record is unchanged."
          : "Call completed. CRM ready to sync.",
      );
    } catch (e) {
      setCallError((e as Error).message);
    } finally {
      submitting.current = false;
      setCompleting(false);
    }
  }
  function startNextCall() {
    const next =
      (prospects.findIndex((p) => p.id === prospectId) + 1) % prospects.length;
    setProspectId(prospects[next].id);
    setOutcome(null);
    setDraft(emptyCallDraft());
    setCompleted(null);
    setResult(null);
    setCallError("");
    setError("");
    setOfferId("coaching");
    setPaymentType("pif");
    setCustom({
      dueToday: 99700,
      remainingPayments: 2,
      futureAmount: 50000,
      firstDate: "",
    });
    setTracking(false);
  }
  async function generate() {
    if (generating.current || completed) return;
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          offerId,
          closerId,
          paymentType,
          custom: paymentType === "custom" ? custom : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult({
        ...data,
        checkout_url: new URL(data.checkout_url, window.location.origin).href,
      });
      notify("Payment link created. Ready to share.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      generating.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result!.checkout_url);
      notify("Payment link copied to clipboard.");
    } catch {
      notify("Copy unavailable. Select and copy the link below.");
    }
  }
  return (
    <>
      <header className="header">
        <div className="brand">
          <span className="brand-symbol">
            <Link2 size={20} />
          </span>
          <div>
            Payment Desk<span>Sales Workspace</span>
          </div>
        </div>
        <div className="header-right">
          <div className="connections">
            <span>
              <i />
              Whop <b>{whopMode}</b>
            </span>
            <span>
              <i />
              GHL <b>{ghlMode}</b>
            </span>
          </div>
          <span className="header-divider" />
          <span className="avatar small">LK</span>
          <span className="user-name">
            Lewis Kirby<small>Sales team</small>
          </span>
        </div>
      </header>
      <main className="workspace">
        <div className="breadcrumb">
          Workspace <ChevronRight size={12} /> Complete call
        </div>
        <div className="page-heading">
          <div>
            <h1>Complete your call</h1>
            <p>Choose an outcome to continue.</p>
          </div>
        </div>
        <div className="desk-grid">
          <div className="form-panel">
            <fieldset
              className="call-form-fields"
              disabled={busy || completing || Boolean(completed)}
            >
              <section className="form-section prospect-section">
                <div className="section-heading">
                  <span className="step">01</span>
                  <h2>Select prospect</h2>
                </div>
                <div className="prospect-picker">
                  <div className="avatar">
                    {prospect.full_name
                      .split(" ")
                      .map((s) => s[0])
                      .join("")}
                  </div>
                  <div className="picker-content">
                    <Select
                      label="Select prospect"
                      value={prospectId}
                      onValueChange={(v) => {
                        setProspectId(v);
                        setOutcome(null);
                        setDraft(emptyCallDraft());
                        setCompleted(null);
                        change();
                      }}
                      options={prospects.map((p) => ({
                        value: p.id,
                        label: p.full_name,
                      }))}
                    />
                    <span>
                      {prospect.email} <span className="dot-separator">·</span>{" "}
                      {prospect.phone}
                    </span>
                  </div>
                  <span className="contact-pill">
                    <span /> Prospect
                  </span>
                </div>
              </section>
              <CallOutcomeSelector
                value={outcome}
                onChange={(value) => {
                  if (value === outcome) return;
                  setOutcome(value);
                  setDraft(emptyCallDraft());
                  change();
                }}
              />
              {outcome === "sold" && (
                <SoldFlow
                  offerId={offerId}
                  setOfferId={setOfferId}
                  paymentType={paymentType}
                  setPaymentType={setPaymentType}
                  custom={custom}
                  setCustom={setCustom}
                  plan={plan}
                  planError={planError}
                  change={change}
                />
              )}
              {outcome === "follow_up" && (
                <FollowUpFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "no_sale" && (
                <NoSaleFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "no_show" && (
                <NoShowFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "unqualified" && (
                <UnqualifiedFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome && (
                <>
                  <section className="form-section closer-section">
                    <div className="section-heading">
                      <span className="step">
                        {outcome === "sold" ? "05" : "04"}
                      </span>
                      <h2>Assign closer</h2>
                    </div>
                    <div className="closer-picker">
                      <span className="avatar small">{closer.initials}</span>
                      <Select
                        label="Assign closer"
                        value={closerId}
                        onValueChange={(v) => {
                          setCloserId(v);
                          change();
                        }}
                        options={closers.map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                      />
                    </div>
                  </section>
                  <section className="tracking-section">
                    <button
                      aria-expanded={tracking}
                      onClick={() => setTracking(!tracking)}
                      className="tracking-toggle"
                    >
                      <Fingerprint size={17} />
                      <span>Attribution & tracking</span>
                      <span className="auto-tag">
                        <Check size={12} /> Auto-filled
                      </span>
                      {tracking ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </button>
                    {tracking && (
                      <dl className="tracking-fields">
                        {Object.entries({
                          "Trakyo ID": prospect.trakyo_id,
                          "UTM source": prospect.utm_source,
                          "UTM medium": prospect.utm_medium,
                          "UTM campaign": prospect.utm_campaign,
                          "Lead source": prospect.lead_source,
                          "Call / appointment ID": prospect.call_id,
                        }).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                  {outcome === "sold" && (
                    <details className="sold-notes">
                      <summary>
                        Add call notes{" "}
                        <span className="optional-label">Optional</span>
                      </summary>
                      <NotesField draft={draft} onChange={updateDraft} />
                    </details>
                  )}
                </>
              )}
            </fieldset>
          </div>
          <aside className="context-column">
            <section className="context-card">
              <div className="card-eyebrow">
                PROSPECT CONTEXT{" "}
                <ContactRound size={16} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="context-person">
                <span className="avatar large">
                  {prospect.full_name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")}
                </span>
                <div>
                  <h3>{prospect.full_name}</h3>
                </div>
              </div>
              <div className="contact-lines">
                <a href={`mailto:${prospect.email}`}>
                  <Mail size={14} />
                  {prospect.email}
                  <ArrowUpRight size={13} />
                </a>
                <a href={`tel:${prospect.phone.replace(/\s/g, "")}`}>
                  <MessageSquare size={14} />
                  {prospect.phone}
                </a>
              </div>
              <div className="context-details">
                <div>
                  <span>Lead source</span>
                  <strong>{prospect.lead_source}</strong>
                </div>
                <div>
                  <span>Opportunity</span>
                  <strong className="stage">
                    <i /> Sales conversation
                  </strong>
                </div>
                <div>
                  <span>Call ID</span>
                  <code>{prospect.call_id}</code>
                </div>
              </div>
              <details className="record-details">
                <summary>
                  View CRM references <ChevronDown size={13} />
                </summary>
                <p>Contact: {prospect.ghl_contact_id}</p>
                <p>Opportunity: {prospect.ghl_opportunity_id}</p>
              </details>
            </section>
            {outcome === "sold" &&
              (result ? (
                <section className="result-card" aria-live="polite">
                  <span className="success-icon">
                    <CircleCheck size={24} />
                  </span>
                  <div className="card-eyebrow">PAYMENT LINK CREATED</div>
                  <h3>{prospect.full_name}</h3>
                  <p>{result.metadata.offer_name}</p>
                  <div className="result-price">
                    {money(result.contract_value)}{" "}
                    <span>· {paymentLabels[result.payment_type]}</span>
                  </div>
                  <div className="result-closer">
                    Closer <strong>{result.metadata.closer_name}</strong>
                  </div>
                  <label className="link-label">
                    Your checkout link
                    <input
                      readOnly
                      value={result.checkout_url}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <Button className="copy-button" onClick={copy}>
                    <Copy size={15} />
                    Copy link
                  </Button>
                  <div className="send-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        notify(
                          "SMS sending is not connected yet. Copy the link to share it.",
                        )
                      }
                    >
                      <MessageSquare size={14} />
                      Send SMS
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        notify(
                          "Email sending is not connected yet. Copy the link to share it.",
                        )
                      }
                    >
                      <Mail size={14} />
                      Send email
                    </Button>
                  </div>
                  <a
                    className="open-checkout"
                    href={result.checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open checkout <ExternalLink size={13} />
                  </a>
                  <small className="mock-caption">
                    {result.mode === "mock"
                      ? "Mock checkout · no payment will be collected"
                      : "Whop checkout created"}
                  </small>
                </section>
              ) : (
                <section className="summary-card">
                  <div className="card-eyebrow">
                    PAYMENT SUMMARY <Wallet size={16} />
                  </div>
                  <div className="summary-offer">
                    <h3>{offer.name}</h3>
                    <span>{paymentLabels[paymentType]}</span>
                  </div>
                  <dl className="summary-lines">
                    <div>
                      <dt>Contract value</dt>
                      <dd>{money(offer.price)}</dd>
                    </div>
                    <div className="due-today">
                      <dt>Due today</dt>
                      <dd>{plan ? money(plan.amountDueToday) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Remaining balance</dt>
                      <dd>{plan ? money(plan.remaining) : "—"}</dd>
                    </div>
                  </dl>
                  <div className="summary-closer">
                    <span>Assigned to</span>
                    <span className="avatar tiny">{closer.initials}</span>
                    <strong>{closer.name}</strong>
                  </div>
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="generate-button"
                    disabled={busy || !plan}
                    onClick={generate}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="spin" size={17} />
                        Creating your link…
                      </>
                    ) : (
                      <>
                        Generate payment link
                        <ArrowRight size={17} />
                      </>
                    )}
                  </Button>
                  <p className="summary-disclaimer">
                    <ShieldCheck size={12} />A link is created. No charge is
                    made.
                  </p>
                </section>
              ))}
            {outcome && (outcome !== "sold" || result) && (
              <CallSummary
                prospect={prospect}
                closer={closer}
                outcome={outcome}
                draft={draft}
                checkout={result}
                completed={completed}
                busy={completing}
                error={callError}
                hint={completionHint}
                onComplete={submitCall}
                onNext={startNextCall}
              />
            )}
          </aside>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
