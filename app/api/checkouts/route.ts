import { resolveCloser } from "@/lib/closer-selection";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCatalog } from "@/lib/catalog";
import { calculatePlan } from "@/lib/payments";
import { createCheckout } from "@/lib/whop";
import { saveSession, getSession } from "@/lib/supabase";
import type { CheckoutSession } from "@/lib/types";
const schema = z.object({
  requestId: z.uuid().optional(),
  prospectId: z.string(),
  offerId: z.string(),
  closerId: z.string(),
  other_closer_name: z.string().trim().max(100).optional(),
  paymentType: z.enum(["pif", "two", "three", "custom"]),
  custom: z
    .object({
      dueToday: z.number(),
      remainingPayments: z.number(),
      futureAmount: z.number(),
      firstDate: z.string(),
    })
    .optional(),
});
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { prospects, offers, closers } = await getCatalog();
    const prospect = prospects.find((p) => p.id === body.prospectId),
      offer = offers.find((o) => o.id === body.offerId),
      closer = resolveCloser(closers, body.closerId, body.other_closer_name);
    if (!prospect || !offer || !closer)
      return NextResponse.json(
        { error: "Select a valid prospect, offer and closer." },
        { status: 400 },
      );
    const plan = calculatePlan(offer, body.paymentType, body.custom);
    if (
      process.env.WHOP_MODE === "real" &&
      !z.email().safeParse(prospect.email).success
    )
      return NextResponse.json(
        {
          error:
            "Add an email to this CRM contact before creating a payment link.",
        },
        { status: 400 },
      );
    const id = body.requestId || crypto.randomUUID();
    const existing = await getSession(id);
    if (existing) {
      if (
        existing.checkout_type !== "sale" ||
        existing.prospect_id !== prospect.id ||
        existing.closer_id !== closer.id ||
        existing.metadata.closer_name !== closer.name ||
        existing.offer_id !== offer.id ||
        JSON.stringify(existing.plan) !== JSON.stringify(plan)
      )
        throw new Error(
          "Checkout request does not match its original context.",
        );
      return NextResponse.json(existing);
    }
    const metadata = {
      checkout_type: "sale" as const,
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
    };
    const checkout = await createCheckout({
      id,
      customer: prospect,
      offer,
      payment: plan,
      metadata,
      origin: new URL(request.url).origin,
    });
    const session: CheckoutSession = {
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
      whop_checkout_id: checkout.id,
      checkout_url: checkout.url,
      call_id: prospect.call_id,
      trakyo_id: prospect.trakyo_id,
      status: "created",
      created_at: new Date().toISOString(),
      metadata,
      plan,
      mode: checkout.mode,
    };
    await saveSession(session);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid checkout details."
            : error instanceof Error
              ? error.message
              : "Unable to generate checkout.",
      },
      { status: 400 },
    );
  }
}
