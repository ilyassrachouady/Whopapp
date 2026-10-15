import { z } from "zod";
import { resolveSchedule } from "./call-validation";
import { usdCents } from "./whop-validation";
import type { Closer, DepositCheckoutSession, Prospect } from "./types";
export function parseDepositAmount(value: string) {
  const cents = usdCents(value.trim());
  if (cents <= 0) throw new Error("Enter a deposit amount greater than $0.");
  return cents;
}
export const depositCheckoutSchema = z.object({
  prospectId: z.string().min(1),
  closerId: z.string().min(1),
  other_closer_name: z.string().trim().max(100).optional(),
  depositAmount: z.number().int().positive().refine(Number.isSafeInteger),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  follow_up_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  time_zone: z.string().min(1).max(80),
  requestId: z.uuid().optional(),
});
export function createDemoDepositCheckout({
  prospect,
  closer,
  amount,
  schedule,
  origin,
  id = crypto.randomUUID(),
}: {
  prospect: Prospect;
  closer: Closer;
  amount: number;
  schedule: {
    follow_up_date: string;
    follow_up_time: string;
    time_zone: string;
  };
  origin: string;
  id?: string;
}): DepositCheckoutSession {
  const parsed = depositCheckoutSchema.parse({
    prospectId: prospect.id,
    closerId: closer.id,
    depositAmount: amount,
    ...schedule,
  });
  const resolved = resolveSchedule(parsed);
  const query = new URLSearchParams({
    prospect: prospect.id,
    closer: closer.id,
    type: "deposit",
    amount: String(amount),
    date: resolved.follow_up_date,
    time: resolved.follow_up_time,
    zone: resolved.time_zone,
  });
  return {
    id,
    checkout_type: "deposit",
    prospect_id: prospect.id,
    closer_id: closer.id,
    offer_id: null,
    contract_value: null,
    payment_type: null,
    deposit_amount: amount,
    amount_due_today: amount,
    payment_count: 1,
    installment_count: 1,
    plan: null,
    ...resolved,
    whop_checkout_id: `demo_${id}`,
    checkout_url: `${origin}/demo-checkout?${query}`,
    call_id: prospect.call_id,
    trakyo_id: prospect.trakyo_id,
    status: "pending_payment",
    created_at: new Date().toISOString(),
    mode: "mock",
    metadata: {
      checkout_type: "deposit",
      prospect_name: prospect.full_name,
      email: prospect.email,
      phone: prospect.phone,
      ghl_contact_id: prospect.ghl_contact_id,
      ghl_opportunity_id: prospect.ghl_opportunity_id,
      closer_id: closer.id,
      closer_name: closer.name,
      offer_id: null,
      offer_name: "Deposit",
      contract_value: null,
      payment_type: null,
      deposit_amount: amount,
      follow_up_at: resolved.follow_up_at,
      call_id: prospect.call_id,
      trakyo_id: prospect.trakyo_id,
      lead_source: prospect.lead_source,
      utm_source: prospect.utm_source,
      utm_medium: prospect.utm_medium,
      utm_campaign: prospect.utm_campaign,
    },
  };
}
