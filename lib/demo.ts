import { withRecording } from "./recording";
import { completeCallSchema, resolveSchedule } from "./call-validation";
import { calculatePlan } from "./payments";
import type {
  Prospect,
  Offer,
  Closer,
  PaymentPlan,
  CheckoutSession,
  SaleCheckoutSession,
  CompleteCallInput,
  CallRecord,
} from "./types";
export function createDemoCheckout({
  prospect,
  offer,
  closer,
  plan,
  origin,
}: {
  prospect: Prospect;
  offer: Offer;
  closer: Closer;
  plan: PaymentPlan;
  origin: string;
}): SaleCheckoutSession {
  const id = crypto.randomUUID();
  const query = new URLSearchParams({
    prospect: prospect.id,
    offer: offer.id,
    closer: closer.id,
    type: plan.type,
  });
  if (plan.type === "custom")
    query.set(
      "custom",
      JSON.stringify({
        dueToday: plan.amountDueToday,
        remainingPayments: plan.paymentCount - 1,
        futureAmount: plan.installments[1],
        firstDate: plan.firstDate,
      }),
    );
  return {
    id,
    checkout_type: "sale",
    installment_count: plan.paymentCount,
    prospect_id: prospect.id,
    closer_id: closer.id,
    offer_id: offer.id,
    contract_value: plan.contractValue,
    payment_type: plan.type,
    amount_due_today: plan.amountDueToday,
    payment_count: plan.paymentCount,
    whop_checkout_id: `demo_${id}`,
    checkout_url: `${origin}/demo-checkout?${query}`,
    call_id: prospect.call_id,
    trakyo_id: prospect.trakyo_id,
    status: "created",
    created_at: new Date().toISOString(),
    mode: "mock",
    plan,
    metadata: {
      checkout_type: "sale",
      prospect_name: prospect.full_name,
      email: prospect.email,
      phone: prospect.phone,
      ghl_contact_id: prospect.ghl_contact_id,
      ghl_opportunity_id: prospect.ghl_opportunity_id,
      closer_id: closer.id,
      closer_name: closer.name,
      offer_id: offer.id,
      offer_name: offer.name,
      contract_value: plan.contractValue,
      payment_type: plan.type,
      call_id: prospect.call_id,
      trakyo_id: prospect.trakyo_id,
      lead_source: prospect.lead_source,
      utm_source: prospect.utm_source,
      utm_medium: prospect.utm_medium,
      utm_campaign: prospect.utm_campaign,
    },
  };
}
export function completeDemoCall(
  input: CompleteCallInput,
  prospect: Prospect,
  closer: Closer,
  checkout: CheckoutSession | null,
): CallRecord {
  const parsed = completeCallSchema.parse(input);
  if (parsed.prospectId !== prospect.id || parsed.closerId !== closer.id)
    throw new Error(
      "Call context does not match the selected prospect and closer.",
    );
  const base = {
    id: crypto.randomUUID(),
    prospect_id: prospect.id,
    prospect_name: prospect.full_name,
    ghl_contact_id: prospect.ghl_contact_id,
    ghl_opportunity_id: prospect.ghl_opportunity_id,
    closer_id: closer.id,
    closer_name: closer.name,
    call_id: prospect.call_id,
    appointment_id: prospect.appointment_id || prospect.call_id,
    lead_source: prospect.lead_source,
    trakyo_id: prospect.trakyo_id,
    utm_source: prospect.utm_source,
    utm_medium: prospect.utm_medium,
    utm_campaign: prospect.utm_campaign,
    notes: withRecording(parsed.notes, parsed.recording_url),
    attendance: parsed.attendance,
    created_at: new Date().toISOString(),
    sync_status: "pending" as const,
    mode: "mock" as const,
  };
  if (parsed.outcome === "sold") {
    if (
      !checkout ||
      checkout.id !== parsed.checkout_session_id ||
      checkout.prospect_id !== prospect.id ||
      checkout.closer_id !== closer.id ||
      (closer.id === "desk-other" &&
        checkout.metadata.closer_name !== closer.name) ||
      checkout.call_id !== prospect.call_id ||
      checkout.checkout_type !== "sale"
    )
      throw new Error("Generate a matching demo checkout first.");
    return {
      ...base,
      attendance: "attended",
      outcome: "sold",
      checkout_session_id: checkout.id,
      offer_id: checkout.offer_id,
      offer_name: checkout.metadata.offer_name,
      contract_value: checkout.contract_value,
      payment_type: checkout.payment_type,
      amount_due_today: checkout.amount_due_today,
      checkout_url: checkout.checkout_url,
      whop_checkout_id: checkout.whop_checkout_id,
    };
  }
  if (parsed.outcome === "deposit") {
    if (
      !checkout ||
      checkout.checkout_type !== "deposit" ||
      checkout.id !== parsed.checkout_session_id ||
      checkout.prospect_id !== prospect.id ||
      checkout.closer_id !== closer.id ||
      (closer.id === "desk-other" &&
        checkout.metadata.closer_name !== closer.name) ||
      checkout.call_id !== prospect.call_id
    )
      throw new Error("Generate a matching deposit link first.");
    const schedule = resolveSchedule(parsed);
    if (
      schedule.follow_up_at !== checkout.follow_up_at ||
      schedule.time_zone !== checkout.time_zone
    )
      throw new Error(
        "Regenerate the deposit link after changing the follow-up.",
      );
    return {
      ...base,
      attendance: "attended",
      outcome: "deposit",
      checkout_session_id: checkout.id,
      ...schedule,
      deposit_amount: checkout.deposit_amount,
      amount_due_today: checkout.amount_due_today,
      checkout_url: checkout.checkout_url,
      whop_checkout_id: checkout.whop_checkout_id,
    };
  }
  if (parsed.outcome === "follow_up")
    return {
      ...base,
      attendance: "attended",
      outcome: "follow_up",
      ...resolveSchedule(parsed),
      follow_up_reason: parsed.follow_up_reason,
      next_step: parsed.next_step,
    };
  if (parsed.attendance !== "attended") {
    return {
      ...base,
      attendance: parsed.attendance,
      outcome: null,
      ...(parsed.attendance !== "rescheduled"
        ? { follow_up_required: parsed.follow_up_required }
        : {}),
      ...(parsed.attendance === "cancelled"
        ? { cancellation_reason: parsed.cancellation_reason }
        : {}),
      ...("follow_up_date" in parsed ? resolveSchedule(parsed) : {}),
    } as CallRecord;
  }
  return {
    ...base,
    attendance: "attended",
    outcome: parsed.outcome,
    loss_reason: parsed.loss_reason,
  };
}
export { calculatePlan };
