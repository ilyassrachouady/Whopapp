import "server-only";
import { WhopClient } from "@whop/sdk";
import type { CheckoutMetadata, Offer, PaymentPlan, Prospect } from "./types";
import { validateWhopPlan } from "./whop-validation";
export const whopSandbox = () => process.env.WHOP_SANDBOX !== "false";
export function getWhop() {
  if (!process.env.WHOP_API_KEY)
    throw new Error("Whop API credentials are missing.");
  return new WhopClient({
    token: process.env.WHOP_API_KEY,
    baseUrl: whopSandbox()
      ? "https://sandbox-api.whop.com/api/v1"
      : "https://api.whop.com/api/v1",
    timeoutInSeconds: 15,
    maxRetries: 1,
  });
}
export async function createCheckout(input: {
  id: string;
  customer: Prospect;
  offer: Offer;
  payment: PaymentPlan;
  metadata: CheckoutMetadata;
  origin: string;
}) {
  if (process.env.WHOP_MODE !== "real")
    return {
      id: `mock_${input.id}`,
      url: `/checkout/${input.id}`,
      mode: "mock" as const,
    };
  if (!process.env.WHOP_COMPANY_ID)
    throw new Error("Configure the Whop company ID.");
  const plans: Record<string, string> = JSON.parse(
    process.env.WHOP_PLAN_IDS_JSON || "{}",
  );
  const planId =
    (input.payment.type !== "custom"
      ? input.offer.paymentOptions?.[input.payment.type]?.whopPlanId
      : null) || plans[`${input.offer.id}:${input.payment.type}`];
  if (!planId)
    throw new Error(
      "Configure a verified Whop plan for this offer and payment option.",
    );
  const client = getWhop();
  const providerPlan = await client.plans.retrieve({ id: planId });
  if (providerPlan.account?.id !== process.env.WHOP_COMPANY_ID)
    throw new Error("The Whop plan belongs to a different company.");
  if (
    input.offer.whopProductId &&
    providerPlan.product?.id !== input.offer.whopProductId
  )
    throw new Error(
      "The Whop plan does not belong to the selected offer’s product.",
    );
  if (
    input.offer.enableCardCheckout &&
    !providerPlan.effective_payment_method_configuration?.enabled?.includes(
      "card",
    )
  )
    throw new Error(
      "Card payments are disabled for this Whop product. Enable Cards in Whop’s payment-method settings before generating the Sofia checkout.",
    );
  validateWhopPlan(
    providerPlan,
    input.payment,
    !process.env.VERCEL &&
      process.env.PAYMENT_DESK_LOCAL_TEST === "true" &&
      planId === process.env.WHOP_LOCAL_TEST_PLAN_ID &&
      input.payment.amountDueToday === 100,
  );
  const checkout = await client.checkoutConfigurations.create(
    {
      account_id: process.env.WHOP_COMPANY_ID,
      plan_id: planId,
      ...(input.offer.enableCardCheckout
        ? {
            payment_method_configuration: {
              enabled: ["card", "bank_wire"],
              disabled: [],
              include_platform_defaults: false,
            },
          }
        : {}),
      mode: "payment",
      metadata: { ...input.metadata, checkout_session_id: input.id },
    },
    { headers: { "Idempotency-Key": input.id } },
  );
  if (!checkout.purchase_url)
    throw new Error("Whop did not return a checkout URL.");
  const url = new URL(checkout.purchase_url);
  const expected = whopSandbox() ? "sandbox.whop.com" : "whop.com";
  if (
    url.protocol !== "https:" ||
    !(url.hostname === expected || url.hostname.endsWith(`.${expected}`))
  )
    throw new Error("Whop returned an unexpected checkout host.");
  return {
    id: checkout.id,
    url: checkout.purchase_url,
    mode: whopSandbox() ? ("sandbox" as const) : ("live" as const),
  };
}

export async function createDepositCheckout(input: {
  id: string;
  amount: number;
  metadata: CheckoutMetadata;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new Error("Invalid deposit amount.");
  if (process.env.WHOP_MODE !== "real")
    return {
      id: `mock_${input.id}`,
      url: `/checkout/${input.id}`,
      mode: "mock" as const,
    };
  if (!process.env.WHOP_COMPANY_ID)
    throw new Error("Configure the Whop company ID.");
  const client = getWhop();
  // Product-free one-time plan: a deposit must not grant sale-product membership.
  const checkout = await client.checkoutConfigurations.create(
    {
      account_id: process.env.WHOP_COMPANY_ID,
      mode: "payment",
      plan: {
        plan_type: "one_time",
        currency: "usd",
        initial_price: input.amount / 100,
        renewal_price: 0,
        title: "Deposit",
        visibility: "hidden",
        release_method: "buy_now",
        override_tax_type: "inclusive",
      },
      metadata: { ...input.metadata, checkout_session_id: input.id },
    },
    { headers: { "Idempotency-Key": input.id } },
  );
  if (!checkout.plan || !checkout.purchase_url)
    throw new Error("Whop did not return a deposit plan and checkout link.");
  const plan = await client.plans.retrieve({ id: checkout.plan.id });
  if (plan.account?.id !== process.env.WHOP_COMPANY_ID)
    throw new Error("Deposit plan belongs to a different company.");
  validateWhopPlan(plan, {
    type: "pif",
    contractValue: input.amount,
    amountDueToday: input.amount,
    remaining: 0,
    paymentCount: 1,
    installments: [input.amount],
  });
  const url = new URL(checkout.purchase_url),
    expected = whopSandbox() ? "sandbox.whop.com" : "whop.com";
  if (
    url.protocol !== "https:" ||
    !(url.hostname === expected || url.hostname.endsWith(`.${expected}`))
  )
    throw new Error("Unexpected Whop checkout host.");
  return {
    id: checkout.id,
    url: checkout.purchase_url,
    mode: whopSandbox() ? ("sandbox" as const) : ("live" as const),
  };
}
