"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { createDemoDepositCheckout, parseDepositAmount } from "@/lib/deposits";
import { DepositFlow } from "./calls/deposit-flow";
import { createDemoCheckout, completeDemoCall } from "@/lib/demo";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { money, paymentLabels } from "@/lib/config";
import { balancedCustom, calculatePlan } from "@/lib/payments";
import type { CheckoutSession, CustomPlan, PaymentType } from "@/lib/types";
import { AttendanceSelector } from "./calls/attendance-selector";
import { AttendanceDetails } from "./calls/attendance-details";
import { CallOutcomeSelector } from "./calls/call-outcome-selector";
import { SoldFlow } from "./calls/sold-flow";
import { FollowUpFlow } from "./calls/follow-up-flow";
import { NoSaleFlow } from "./calls/no-sale-flow";
import { UnqualifiedFlow } from "./calls/unqualified-flow";
import { NotesField } from "./calls/flow-fields";
import { CallSummary } from "./calls/call-summary";
import { emptyCallDraft, schedulePayload } from "@/lib/call-options";
import { CloserPicker } from "./closer-picker";
import { OTHER_CLOSER_ID } from "@/lib/closer-selection";
import { recordingFromNotes } from "@/lib/recording";
import { CrmContactPicker } from "./crm-contact-picker";
import { completeCallSchema, resolveSchedule } from "@/lib/call-validation";
import type {
  Attendance,
  CallDraft,
  CallOutcome,
  CallRecord,
  CompleteCallInput,
} from "@/lib/types";
export default function PaymentDesk({
  whopMode,
  ghlMode,
  catalog,
  demoMode = false,
  initialProspectId,
  contactError = "",
}: {
  whopMode: string;
  ghlMode: string;
  demoMode?: boolean;
  initialProspectId?: string;
  contactError?: string;
  catalog: {
    prospects: import("@/lib/types").Prospect[];
    closers: import("@/lib/types").Closer[];
    offers: import("@/lib/types").Offer[];
  };
}) {
  const router = useRouter();
  const { offers } = catalog;
  const closers = catalog.closers;
  const [otherCloserName, setOtherCloserName] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [prospects, setProspects] = useState(catalog.prospects);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [draft, setDraft] = useState<CallDraft>(emptyCallDraft);
  const [notesSyncStatus, setNotesSyncStatus] = useState("mock");
  const [appointmentSync, setAppointmentSync] = useState<{
    status: string;
    message?: string;
  }>({ status: "mock" });
  const [assignmentStatus, setAssignmentStatus] = useState("mock");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [completed, setCompleted] = useState<CallRecord | null>(null);
  const [completing, setCompleting] = useState(false);
  const [callError, setCallError] = useState("");
  const submitting = useRef(false);
  const generating = useRef(false);
  const checkoutRequestId = useRef<string | null>(null);
  const [prospectId, setProspectId] = useState(
      initialProspectId || prospects[0].id,
    ),
    [offerId, setOfferId] = useState(offers[0].id),
    [closerId, setCloserId] = useState(
      closers.find(
        (c) =>
          c.id ===
          (prospects.find((p) => p.id === initialProspectId) || prospects[0])
            .closer_id,
      )?.id || closers[0].id,
    ),
    [paymentType, setPaymentType] = useState<PaymentType>("pif");
  const [custom, setCustom] = useState<CustomPlan>(() =>
    balancedCustom(offers[0]),
  );
  const [tracking, setTracking] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<CheckoutSession | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const prospect = prospects.find((p) => p.id === prospectId)!,
    offer = offers.find((o) => o.id === offerId)!,
    selectedCloser = closers.find((c) => c.id === closerId) || closers[0],
    closer =
      closerId === OTHER_CLOSER_ID && otherCloserName.trim()
        ? { ...selectedCloser, name: otherCloserName.trim() }
        : selectedCloser;
  let plan: import("@/lib/types").PaymentPlan | undefined;
  let planError = "";
  try {
    plan = calculatePlan(offer, paymentType, custom);
  } catch (e) {
    planError = (e as Error).message;
  }
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  const change = () => {
    checkoutRequestId.current = null;
    setResult(null);
    setError("");
    setCallError("");
  };
  function updateDraft(patch: Partial<CallDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setCallError("");
    if (
      outcome === "deposit" &&
      (patch.depositAmount !== undefined ||
        patch.followUpDate !== undefined ||
        patch.followUpTime !== undefined)
    )
      change();
  }
  function callInput(): CompleteCallInput {
    const base = {
      prospectId,
      closerId,
      other_closer_name: otherCloserName,
      notes: draft.notes,
      recording_url: recordingUrl,
    };
    if (closerId === OTHER_CLOSER_ID && otherCloserName.trim().length < 2)
      throw new Error("Enter the other closer’s name.");
    if (!attendance) throw new Error("Select attendance.");
    if (attendance === "rescheduled") {
      if (!draft.followUpDate || !draft.followUpTime)
        throw new Error("Choose the new date and time.");
      return { ...base, attendance, outcome: null, ...schedulePayload(draft) };
    }
    if (attendance === "cancelled" || attendance === "no_show") {
      if (attendance === "cancelled" && !draft.cancellationReason)
        throw new Error("Select a cancellation reason.");
      if (
        draft.followUpRequired &&
        (!draft.followUpDate || !draft.followUpTime)
      )
        throw new Error("Choose a follow-up date and time.");
      return {
        ...base,
        attendance,
        outcome: null,
        follow_up_required: draft.followUpRequired,
        ...(attendance === "cancelled"
          ? { cancellation_reason: draft.cancellationReason }
          : {}),
        ...(draft.followUpRequired ? schedulePayload(draft) : {}),
      };
    }
    const attended = { ...base, attendance: "attended" as const };
    if (outcome === "deposit") {
      if (!draft.followUpDate || !draft.followUpTime)
        throw new Error("Set a follow-up date and time.");
      parseDepositAmount(draft.depositAmount);
      if (!result || result.checkout_type !== "deposit")
        throw new Error("Generate a deposit link first.");
      return {
        ...attended,
        outcome: "deposit",
        checkout_session_id: result.id,
        ...schedulePayload(draft),
      };
    }
    if (outcome === "sold") {
      if (!result) throw new Error("Generate a payment link first.");
      return { ...attended, outcome: "sold", checkout_session_id: result.id };
    }
    if (outcome === "follow_up") {
      if (!draft.followUpDate || !draft.followUpTime)
        throw new Error("Choose a follow-up date and time.");
      if (!draft.followUpReason) throw new Error("Select a follow-up reason.");
      if (!draft.nextStep.trim()) throw new Error("Add the next step.");
      return {
        ...attended,
        outcome: "follow_up",
        ...schedulePayload(draft),
        follow_up_reason: draft.followUpReason,
        next_step: draft.nextStep,
      };
    }
    if (outcome === "no_sale" || outcome === "unqualified") {
      if (!draft.lossReason) throw new Error("Select a reason.");
      return { ...attended, outcome: outcome, loss_reason: draft.lossReason };
    }
    throw new Error("Select a call outcome.");
  }
  let completionHint = "";
  try {
    const input = completeCallSchema.parse(callInput());
    if (
      "follow_up_date" in input &&
      input.follow_up_date &&
      input.follow_up_time &&
      input.time_zone
    )
      resolveSchedule({
        follow_up_date: input.follow_up_date,
        follow_up_time: input.follow_up_time,
        time_zone: input.time_zone,
      });
  } catch (e) {
    completionHint = e instanceof Error ? e.message : "Check the call details.";
  }
  async function submitCall() {
    if (submitting.current || completed) return;
    submitting.current = true;
    setCompleting(true);
    setCallError("");
    try {
      if (demoMode) {
        const record = completeDemoCall(callInput(), prospect, closer, result);
        sessionStorage.setItem(
          `payment-desk-demo-call:${record.id}`,
          JSON.stringify(record),
        );
        setCompleted(record);
        notify("Demo call completed. No CRM updates sent.");
        return;
      }
      const response = await fetch("/api/calls/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callInput()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAssignmentStatus(data.assignment?.status || "mock");
      setNotesSyncStatus(data.notesSync?.status || "mock");
      setAppointmentSync(data.appointmentSync || { status: "mock" });
      const record: CallRecord = data.record;
      setCompleted(record);
      setAttendance(record.attendance);
      setOutcome(record.outcome);
      setRecordingUrl(recordingFromNotes(record.notes));
      setCloserId(record.closer_id);
      if (record.closer_id === OTHER_CLOSER_ID)
        setOtherCloserName(record.closer_name);
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
        ...("follow_up_required" in record
          ? { followUpRequired: record.follow_up_required }
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
        if (data.checkout.checkout_type === "sale") {
          setOfferId(data.checkout.offer_id);
          setPaymentType(data.checkout.payment_type);
        }
      } else setResult(null);
      notify(
        data.duplicate
          ? "This call was already completed. Your saved record is unchanged."
          : data.assignment?.status === "synced"
            ? "Call saved. GHL contact assignment synced."
            : data.assignment?.status === "failed"
              ? "Call saved. GHL assignment needs a retry."
              : "Call saved. GHL owner unchanged.",
      );
    } catch (e) {
      setCallError((e as Error).message);
    } finally {
      submitting.current = false;
      setCompleting(false);
    }
  }
  async function retryAssignment() {
    if (!completed || assignmentBusy) return;
    setAssignmentBusy(true);
    try {
      const response = await fetch("/api/calls/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: completed.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCompleted(data.record);
      setAssignmentStatus(data.assignment.status);
      setNotesSyncStatus(data.notesSync?.status || "mock");
      setAppointmentSync(data.appointmentSync || { status: "mock" });
      notify(
        data.appointmentSync?.status === "failed"
          ? data.appointmentSync.message
          : data.notesSync?.status === "failed"
            ? data.notesSync.message
            : data.assignment.status === "synced"
              ? "GHL contact assignment synced."
              : data.assignment.message || "GHL owner unchanged.",
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setAssignmentBusy(false);
    }
  }
  function startNextCall() {
    setNotesSyncStatus("mock");
    setAppointmentSync({ status: "mock" });
    const next =
      (prospects.findIndex((p) => p.id === prospectId) + 1) % prospects.length;
    checkoutRequestId.current = null;
    setProspectId(prospects[next].id);
    setCloserId(
      closers.find((c) => c.id === prospects[next].closer_id)?.id ||
        closers[0].id,
    );
    setAttendance(null);
    setOutcome(null);
    setDraft(emptyCallDraft());
    setRecordingUrl("");
    setOtherCloserName("");
    setCompleted(null);
    setResult(null);
    setCallError("");
    setError("");
    setOfferId(offers[0].id);
    setPaymentType("pif");
    setCustom(balancedCustom(offers[0]));
    setTracking(false);
  }
  async function generate() {
    if (generating.current || completed) return;
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      if (closerId === OTHER_CLOSER_ID && otherCloserName.trim().length < 2)
        throw new Error("Enter the other closer’s name.");
      checkoutRequestId.current ||= crypto.randomUUID();
      if (outcome === "deposit") {
        const depositAmount = parseDepositAmount(draft.depositAmount);
        const schedule = schedulePayload(draft);
        resolveSchedule(schedule);
        if (demoMode) {
          setResult(
            createDemoDepositCheckout({
              prospect,
              closer,
              amount: depositAmount,
              schedule,
              origin: window.location.origin,
            }),
          );
        } else {
          const response = await fetch("/api/checkouts/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prospectId,
              closerId,
              other_closer_name: otherCloserName,
              depositAmount,
              requestId: checkoutRequestId.current,
              ...schedule,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          setResult({
            ...data,
            checkout_url: new URL(data.checkout_url, window.location.origin)
              .href,
          });
        }
        notify("Deposit link created. Payment is pending.");
        return;
      }
      if (demoMode) {
        if (!plan) throw new Error("Check the payment plan.");
        setResult(
          createDemoCheckout({
            prospect,
            offer,
            closer,
            plan,
            origin: window.location.origin,
          }),
        );
        notify("Demo checkout link created.");
        return;
      }
      const response = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: checkoutRequestId.current,
          prospectId,
          offerId,
          closerId,
          other_closer_name: otherCloserName,
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
  async function sendLink(channel: "sms" | "email") {
    if (!result) return;
    if (demoMode) {
      notify(
        `Demo ${channel === "sms" ? "SMS" : "email"} simulated. No message was sent.`,
      );
      return;
    }
    try {
      const response = await fetch(`/api/checkouts/${result.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      notify(`${channel === "sms" ? "SMS" : "Email"} queued by GHL.`);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not send the link.",
      );
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
          {!demoMode && (
            <button
              type="button"
              className="desk-signout"
              onClick={async () => {
                await fetch("/api/auth/signout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
            >
              Sign out
            </button>
          )}
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
        {demoMode && (
          <div className="demo-banner">
            <span className="demo-label">Interactive demo</span>
            <span>Sample data · Simulated payments and messages</span>
          </div>
        )}
        <div className="breadcrumb">
          Workspace <ChevronRight size={12} /> Complete call
        </div>
        <div className="page-heading">
          <div>
            <h1>Complete your call</h1>
            <p>Choose attendance to continue.</p>
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
                {!demoMode && ghlMode === "Configured" && (
                  <CrmContactPicker
                    onSelect={(p) => {
                      setProspects((previous) => [
                        p,
                        ...previous.filter((x) => x.id !== p.id),
                      ]);
                      setProspectId(p.id);
                      setCloserId(
                        closers.find((c) => c.id === p.closer_id)?.id ||
                          closers[0].id,
                      );
                      setAttendance(null);
                      setOutcome(null);
                      setDraft(emptyCallDraft());
                      setRecordingUrl("");
                      setOtherCloserName("");
                      setCompleted(null);
                      setCallError("");
                      change();
                    }}
                  />
                )}
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
                        setCloserId(
                          closers.find(
                            (c) =>
                              c.id ===
                              prospects.find((p) => p.id === v)?.closer_id,
                          )?.id || closers[0].id,
                        );
                        setAttendance(null);
                        setOutcome(null);
                        setDraft(emptyCallDraft());
                        setRecordingUrl("");
                        setOtherCloserName("");
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
              {contactError && (
                <p className="error" role="alert">
                  {contactError}
                </p>
              )}
              <AttendanceSelector
                value={attendance}
                onChange={(value) => {
                  if (value === attendance) return;
                  setAttendance(value);
                  setOutcome(null);
                  setDraft(emptyCallDraft());
                  setRecordingUrl("");
                  setOtherCloserName("");
                  change();
                }}
              />
              {attendance === "attended" && (
                <CallOutcomeSelector
                  value={outcome}
                  onChange={(value) => {
                    if (value === outcome) return;
                    setOutcome(value);
                    setDraft(emptyCallDraft());
                    setRecordingUrl("");
                    setOtherCloserName("");
                    change();
                  }}
                />
              )}
              {attendance && attendance !== "attended" && (
                <AttendanceDetails
                  attendance={attendance}
                  draft={draft}
                  onChange={updateDraft}
                />
              )}
              {outcome === "sold" && (
                <SoldFlow
                  offers={offers}
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
              {outcome === "deposit" && (
                <DepositFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "follow_up" && (
                <FollowUpFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "no_sale" && (
                <NoSaleFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome === "unqualified" && (
                <UnqualifiedFlow draft={draft} onChange={updateDraft} />
              )}
              {outcome && (
                <>
                  <section className="form-section closer-section">
                    <div className="section-heading">
                      <span className="step">
                        {outcome === "sold"
                          ? "06"
                          : attendance === "attended"
                            ? "05"
                            : "04"}
                      </span>
                      <h2>Assign closer</h2>
                    </div>
                    {!demoMode && (
                      <p className="entry-hint">
                        {prospect.closer_id
                          ? "Selected from this contact’s GHL owner. Completing the call saves the selected owner to GHL."
                          : prospect.assigned_ghl_user_id
                            ? "The current GHL owner is outside the approved closer list. Choose a closer to reassign, or Other to keep the current owner."
                            : "Choose a closer to assign this contact in GHL when you complete the call."}
                      </p>
                    )}
                    <div className="closer-picker">
                      <span className="avatar small">{closer.initials}</span>
                      <CloserPicker
                        closers={closers}
                        value={closerId}
                        otherName={otherCloserName}
                        onChange={(id) => {
                          setCloserId(id);
                          setOtherCloserName("");
                          change();
                        }}
                        onOtherName={(name) => {
                          setOtherCloserName(name);
                          change();
                        }}
                      />
                    </div>
                  </section>
                  <section className="form-section recording-section">
                    <label htmlFor="recording-url">
                      Call recording{" "}
                      <span className="optional-label">Optional</span>
                    </label>
                    <input
                      id="recording-url"
                      type="url"
                      placeholder="https://…"
                      maxLength={2000}
                      value={recordingUrl}
                      onChange={(event) => {
                        setRecordingUrl(event.target.value);
                        setCallError("");
                      }}
                    />
                    <p>
                      Paste a recording link from Fathom, Zoom, Meet, or your
                      recording tool. Saved with this call report.
                    </p>
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
            {(outcome === "sold" || outcome === "deposit") &&
              (result ? (
                <section
                  className="result-card pending-checkout"
                  aria-live="polite"
                >
                  <span className="success-icon">
                    <Link2 size={24} />
                  </span>
                  <div className="card-eyebrow">
                    {result.checkout_type === "deposit"
                      ? "DEPOSIT PAYMENT LINK CREATED"
                      : "PAYMENT LINK CREATED"}
                  </div>
                  <h3>{prospect.full_name}</h3>
                  <p>{result.metadata.offer_name}</p>
                  <div className="result-price">
                    {money(
                      result.checkout_type === "deposit"
                        ? result.deposit_amount
                        : result.contract_value,
                    )}{" "}
                    <span>
                      ·{" "}
                      {result.checkout_type === "deposit"
                        ? "One-time deposit"
                        : paymentLabels[result.payment_type]}
                    </span>
                  </div>
                  <div className="result-closer">
                    Closer <strong>{result.metadata.closer_name}</strong>
                  </div>
                  <p className="payment-pending-label">
                    {result.status === "paid"
                      ? "Payment received"
                      : result.status === "partially_paid"
                        ? "Installment received · balance outstanding"
                        : result.status === "failed"
                          ? "Payment failed"
                          : "Pending payment · no payment received"}
                  </p>
                  {result.checkout_type === "deposit" && (
                    <p className="deposit-follow-up">
                      Follow-up: {result.follow_up_date} at{" "}
                      {result.follow_up_time} ({result.time_zone})
                    </p>
                  )}
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
                    <Button variant="outline" onClick={() => sendLink("sms")}>
                      <MessageSquare size={14} />
                      Send SMS
                    </Button>
                    <Button variant="outline" onClick={() => sendLink("email")}>
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
                      : result.mode === "sandbox"
                        ? "Whop sandbox checkout · test payments only"
                        : "Whop checkout created"}
                  </small>
                </section>
              ) : outcome === "deposit" ? (
                <section className="summary-card">
                  <div className="card-eyebrow">
                    DEPOSIT SUMMARY <Wallet size={16} />
                  </div>
                  <div className="summary-offer">
                    <h3>One-time deposit</h3>
                    <span>USD · not generated</span>
                  </div>
                  <dl className="summary-lines">
                    <div className="due-today">
                      <dt>Deposit amount</dt>
                      <dd>
                        {draft.depositAmount &&
                        /^\d+(\.\d{1,2})?$/.test(draft.depositAmount)
                          ? money(Number(draft.depositAmount) * 100)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Follow-up</dt>
                      <dd>
                        {draft.followUpDate && draft.followUpTime
                          ? `${draft.followUpDate} · ${draft.followUpTime}`
                          : "Required"}
                      </dd>
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
                    disabled={
                      busy ||
                      !draft.depositAmount ||
                      !draft.followUpDate ||
                      !draft.followUpTime
                    }
                    onClick={generate}
                  >
                    {busy ? "Creating your link…" : "Generate deposit link"}
                    <ArrowRight size={17} />
                  </Button>
                  <p className="summary-disclaimer">
                    One-time payment. Customer onboarding starts only after a
                    sale payment.
                  </p>
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
                      <dd>{plan ? money(plan.contractValue) : "—"}</dd>
                    </div>
                    <div className="due-today">
                      <dt>Due today</dt>
                      <dd>{plan ? money(plan.amountDueToday) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Remaining</dt>
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
            {attendance &&
              (attendance !== "attended" ||
                (outcome &&
                  ((outcome !== "sold" && outcome !== "deposit") ||
                    result))) && (
                <CallSummary
                  prospect={prospect}
                  closer={closer}
                  attendance={attendance}
                  outcome={outcome}
                  draft={draft}
                  checkout={result}
                  completed={completed}
                  notesSyncStatus={notesSyncStatus}
                  appointmentSync={appointmentSync}
                  assignmentStatus={assignmentStatus}
                  assignmentBusy={assignmentBusy}
                  onRetryAssignment={retryAssignment}
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
