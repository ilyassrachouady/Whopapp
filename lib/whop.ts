import "server-only";
import type { CheckoutMetadata, Offer, PaymentPlan, Prospect } from "./types";
export async function createCheckout(input: {
  id: string;
  customer: Prospect;
  offer: Offer;
  payment: PaymentPlan;
  metadata: CheckoutMetadata;
  origin: string;
}) {
  if (!process.env.WHOP_API_KEY)
    return {
      id: `mock_${input.id}`,
      url: `/checkout/${input.id}`,
      mode: "mock" as const,
    };
  // Live plans must be provisioned and verified in Whop first. Never approximate a custom schedule.
  const plans: Record<string, string> = JSON.parse(
    process.env.WHOP_PLAN_IDS_JSON || "{}",
  );
  if (input.payment.type === "custom")
    throw new Error(
      "Custom plans are available in mock mode only until Whop schedules are configured.",
    );
  const planId = plans[`${input.offer.id}:${input.payment.type}`];
  if (!planId)
    throw new Error(
      "A verified Whop plan is required for this offer and payment option.",
    );
  const res = await fetch(
    "https://api.whop.com/api/v1/checkout_configurations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.id,
      },
      body: JSON.stringify({
        plan_id: planId,
        mode: "payment",
        metadata: input.metadata,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok)
    throw new Error("Whop could not create this checkout. Please retry.");
  const data = await res.json();
  if (
    !data.id ||
    !data.purchase_url ||
    !String(data.purchase_url).startsWith("https://")
  )
    throw new Error("Whop returned an invalid checkout.");
  return {
    id: data.id as string,
    url: data.purchase_url as string,
    mode: "live" as const,
  };
}
