import "server-only";
import { WhopClient } from "@whop/sdk";
import type { CheckoutMetadata, Offer, PaymentPlan, Prospect } from "./types";
import { validateWhopPlan } from "./whop-validation";

export const whopSandbox = () => process.env.WHOP_SANDBOX !== "false";

function whopApiBaseUrl() {
  return whopSandbox()
    ? "https://sandbox-api.whop.com/api/v1"
    : "https://api.whop.com/api/v1";
}

export function getWhop() {
  if (!process.env.WHOP_API_KEY)
    throw new Error("Whop API credentials are missing.");
  return new WhopClient({
    token: process.env.WHOP_API_KEY,
    baseUrl: whopApiBaseUrl(),
    timeoutInSeconds: 15,
    maxRetries: 1,
  });
}

function getPublicWhop() {
  return new WhopClient({
    auth: false,
    baseUrl: whopApiBaseUrl(),
    timeoutInSeconds: 15,
    maxRetries: 1,
  });
}

function daysUntil(date: string) {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round(
    (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function normalizeProductPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "").replace(/\/checkout\/.*$/, "");
}

function productRouteFromPath(value: string) {
  const normalized = normalizeProductPath(value);
  return normalized.split("/").at(-1) || normalized;
}

function accountRouteFromPath(value: string) {
  const normalized = normalizeProductPath(value);
  return normalized.split("/")[0] || "";
}

function objectString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

async function resolveProductFromPath(offer: Offer) {
  if (offer.whopProductId) return offer.whopProductId;
  if (!offer.whopProductPath) return null;

  const desiredRoute = productRouteFromPath(offer.whopProductPath);
  const desiredAccountRoute = accountRouteFromPath(offer.whopProductPath);
  const publicClient = getPublicWhop();
  const queries = [desiredRoute, desiredRoute.replace(/-/g, " ")];

  for (const query of [...new Set(queries)]) {
    const products = await publicClient.products.list({
      query,
      first: 100,
      visibilities: ["visible"],
    });

    for await (const product of products) {
      if (productRouteFromPath(product.route) !== desiredRoute) continue;

      const accountRoute = objectString(product.account, "route");
      const accountId = objectString(product.account, "id");
      const sameAccount =
        accountRoute === desiredAccountRoute ||
        (!!process.env.WHOP_COMPANY_ID &&
          accountId === process.env.WHOP_COMPANY_ID);

      if (sameAccount) return product.id;
    }
  }

  throw new Error(
    `Could not find the public Whop product ${offer.whopProductPath}.`,
  );
}

async function listOfferPlans(
  client: ReturnType<typeof getWhop>,
  offer: Offer,
) {
  const productId = await resolveProductFromPath(offer);
  if (!productId || !process.env.WHOP_COMPANY_ID) return [];

  const page = await client.plans.list({
    account_id: process.env.WHOP_COMPANY_ID,
    product_ids: [productId],
  });
  const plans: { id: string }[] = [];
  for await (const plan of page) plans.push({ id: plan.id });
  return plans;
}

async function resolveOfferProductId(
  client: ReturnType<typeof getWhop>,
  offer: Offer,
): Promise<string> {
  if (offer.whopProductPath) {
    const productId = await resolveProductFromPath(offer);
    if (productId) return productId;
  }

  if (offer.whopProductId) return offer.whopProductId;

  const configuredPlans: Record<string, string> = JSON.parse(
    process.env.WHOP_PLAN_IDS_JSON || "{}",
  );
  const candidatePlanIds = [
    offer.paymentOptions?.pif?.whopPlanId,
    offer.paymentOptions?.two?.whopPlanId,
    offer.paymentOptions?.three?.whopPlanId,
    configuredPlans[`${offer.id}:pif`],
    configuredPlans[`${offer.id}:two`],
    configuredPlans[`${offer.id}:three`],
  ].filter((id): id is string => Boolean(id));

  for (const planId of [...new Set(candidatePlanIds)]) {
    try {
      const plan = await client.plans.retrieve({ id: planId });
      if (
        plan.account?.id === process.env.WHOP_COMPANY_ID &&
        plan.product?.id
      )
        return String(plan.product.id);
    } catch {
      // Stale plan IDs should not prevent another verified plan from resolving.
    }
  }

  throw new Error(
    "Configure at least one verified Whop plan for this offer before using a custom plan.",
  );
}

async function findExistingOfferPlan(
  client: ReturnType<typeof getWhop>,
  offer: Offer,
  payment: PaymentPlan,
) {
  if (!offer.whopProductPath) return null;
  const candidates = await listOfferPlans(client, offer);

  for (const candidate of candidates) {
    try {
      const plan = await client.plans.retrieve({ id: candidate.id });
      if (plan.account?.id !== process.env.WHOP_COMPANY_ID) continue;
      if (
        offer.enableCardCheckout &&
        !plan.effective_payment_method_configuration?.enabled?.includes("card")
      )
        continue;
      validateWhopPlan(plan, payment);
      return plan.id;
    } catch {
      // Keep looking: public products can contain several unrelated pricing plans.
    }
  }

  return null;
}

async function createStandardOfferPlan(
  client: ReturnType<typeof getWhop>,
  input: { id: string; offer: Offer; payment: PaymentPlan },
) {
  if (!process.env.WHOP_COMPANY_ID)
    throw new Error("Configure the Whop company ID.");

  const productId = await resolveOfferProductId(client, input.offer);
  const recurring = input.payment.paymentCount > 1;
  const renewalAmount = recurring ? input.payment.installments[1] : 0;
  const futureInstallments = input.payment.installments.slice(1);

  if (
    recurring &&
    (!renewalAmount ||
      !futureInstallments.every((amount) => amount === renewalAmount))
  )
    throw new Error("Whop split payments require equal future installments.");

  // On a Whop renewal plan, initial_price is an ADDITIONAL upfront amount
  // charged on top of the first renewal_price. Keep renewal_price as the
  // repeating installment and use initial_price only for any first-payment
  // cent adjustment (for example $3,497 / 3 => 1165.68, 1165.66, 1165.66).
  const initialAdjustment = recurring
    ? input.payment.amountDueToday - renewalAmount
    : input.payment.amountDueToday;
  if (initialAdjustment < 0)
    throw new Error("The first installment cannot be lower than later installments.");

  const plan = await client.plans.create(
    {
      account_id: process.env.WHOP_COMPANY_ID,
      product_id: productId,
      plan_type: recurring ? "renewal" : "one_time",
      currency: "usd",
      initial_price: initialAdjustment / 100,
      renewal_price: recurring ? renewalAmount / 100 : 0,
      ...(recurring
        ? {
            billing_period: 30,
            split_pay_required_payments: input.payment.paymentCount,
          }
        : {}),
      title: `${input.offer.name} ${input.payment.type}`.slice(0, 30),
      visibility: "hidden",
      release_method: "buy_now",
      ...(input.offer.enableCardCheckout
        ? {
            payment_method_configuration: {
              enabled: ["card", "bank_wire"],
              disabled: [],
              include_platform_defaults: false,
            },
          }
        : {}),
    },
    {
      headers: {
        "Idempotency-Key": `offer-plan:v2:${input.id}:${input.payment.type}:${input.payment.amountDueToday}:${renewalAmount}:${input.payment.paymentCount}`,
      },
    },
  );

  validateWhopPlan(plan, input.payment);
  return plan.id;
}

async function createCustomPlan(
  client: ReturnType<typeof getWhop>,
  input: { id: string; offer: Offer; payment: PaymentPlan },
) {
  if (!process.env.WHOP_COMPANY_ID)
    throw new Error("Configure the Whop company ID.");
  if (!input.payment.firstDate)
    throw new Error("Choose the first future payment date.");
  const future = input.payment.installments.slice(1);
  if (!future.length || !future.every((amount) => amount === future[0]))
    throw new Error(
      "Custom Whop plans require equal future installment amounts.",
    );
  const trialDays = daysUntil(input.payment.firstDate);
  if (trialDays < 1)
    throw new Error("Choose a future date for the next payment.");
  const productId = await resolveOfferProductId(client, input.offer);
  const plan = await client.plans.create(
    {
      account_id: process.env.WHOP_COMPANY_ID,
      product_id: productId,
      plan_type: "renewal",
      currency: "usd",
      initial_price: input.payment.amountDueToday / 100,
      renewal_price: future[0] / 100,
      billing_period: 30,
      split_pay_required_payments: future.length,
      trial_period_days: trialDays,
      title: `${input.offer.name} custom`.slice(0, 30),
      visibility: "hidden",
      release_method: "buy_now",
      ...(input.offer.enableCardCheckout
        ? {
            payment_method_configuration: {
              enabled: ["card", "bank_wire"],
              disabled: [],
              include_platform_defaults: false,
            },
          }
        : {}),
    },
    { headers: { "Idempotency-Key": `custom-plan:${input.id}` } },
  );
  validateWhopPlan(plan, input.payment);
  return plan.id;
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

  const client = getWhop();
  const plans: Record<string, string> = JSON.parse(
    process.env.WHOP_PLAN_IDS_JSON || "{}",
  );

  let planId: string | null = null;
  if (input.payment.type === "custom") {
    planId = await createCustomPlan(client, input);
  } else if (input.offer.whopProductPath) {
    planId = await findExistingOfferPlan(client, input.offer, input.payment);
    if (!planId) planId = await createStandardOfferPlan(client, input);
  } else {
    planId =
      input.offer.paymentOptions?.[input.payment.type]?.whopPlanId ||
      plans[`${input.offer.id}:${input.payment.type}`] ||
      null;
  }

  if (!planId)
    throw new Error(
      "Configure a verified Whop plan for this offer and payment option.",
    );

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
