import "server-only";
import { randomUUID } from "node:crypto";
import { getCatalog } from "./catalog";
import { getSession } from "./supabase";
import { paymentStore, type PaymentStore } from "./payment-store";
import { updateGHLContactToCustomer } from "./ghl";
import {
  notifyDeposit,
  notifyNewClient,
  type SalesNotification,
} from "./slack";
import { sendWelcomeEmail } from "./welcome-email";
import { provisionProductAccess } from "./product-access";
import type { CheckoutSession, Prospect, Offer, PaymentRecord } from "./types";
import { sendGHLPaymentWebhook } from "./ghl-payment-webhook";
export interface ConfirmedPayment {
  checkout_session_id: string;
  whop_payment_id: string;
  amount_collected: number;
  paid_at: string;
}
interface Context {
  session: CheckoutSession;
  payment: PaymentRecord;
  contact: Prospect;
  offer: Offer | null;
  notification: SalesNotification;
  live: boolean;
}
export interface PaymentServices {
  customer: (
    context: Context,
    key: string,
  ) => Promise<import("./payment-store").ActionReceipt>;
  newClient: (
    context: Context,
    key: string,
  ) => Promise<import("./payment-store").ActionReceipt>;
  deposit: (
    context: Context,
    key: string,
  ) => Promise<import("./payment-store").ActionReceipt>;
  welcome: (
    context: Context,
    key: string,
  ) => Promise<import("./payment-store").ActionReceipt>;
  access: (
    context: Context,
    key: string,
  ) => Promise<import("./payment-store").ActionReceipt>;
}
const services: PaymentServices = {
  customer: (c) => updateGHLContactToCustomer(c.contact.ghl_contact_id, c.live),
  newClient: (c, key) => notifyNewClient(c.notification, key, c.live),
  deposit: (c, key) => notifyDeposit(c.notification, key, c.live),
  welcome: (c, key) => c.live && process.env.GHL_PAYMENT_WEBHOOK_URL
    ? sendGHLPaymentWebhook(c.notification, c.session.id, key)
    : sendWelcomeEmail({ contact: c.contact, offer: c.offer!, live: c.live }),
  access: (c) =>
    provisionProductAccess({
      contact: c.contact,
      offer: c.offer!,
      payment: c.payment,
    }),
};
export async function processDepositPayment(
  context: Context,
  store: PaymentStore,
  actions = services,
) {
  const key = `deposit:${context.payment.whop_payment_id}:slack`;
  return {
    deposit_notification: await store.action(
      key,
      context.session.id,
      context.payment.whop_payment_id,
      (k) => actions.deposit(context, k),
    ),
  };
}
export async function processNewCustomer(
  context: Context,
  store: PaymentStore,
  actions = services,
) {
  const scope = `sale:${context.session.id}`; // First installment onboards once per sale, not once per payment.
  const run = (name: keyof PaymentServices) =>
    store.action(
      `${scope}:${name}`,
      context.session.id,
      context.payment.whop_payment_id,
      (key) => actions[name](context, key),
    );
  if (context.live && process.env.PAYMENT_WORKFLOW_OWNER !== "app") {
    return {
      workflow: await run("welcome"),
      owner: "ghl",
      customer: "delegated_to_ghl",
      access: "pending_integration",
    };
  }
  if (context.live && process.env.WELCOME_EMAIL_MODE !== "direct")
    throw new Error(
      "App-owned onboarding requires direct email mode to avoid duplicate GHL notifications.",
    );
  const customer = await run("customer");
  const notification = await run("newClient");
  const welcome = await run("welcome");
  const access = await run("access");
  return { customer, notification, welcome, access, owner: "app" };
}
export async function handleWhopPaymentSuccess(
  input: ConfirmedPayment,
  options: {
    session?: CheckoutSession;
    store?: PaymentStore;
    services?: PaymentServices;
    catalog?: Awaited<ReturnType<typeof getCatalog>>;
  } = {},
) {
  const session =
    options.session || (await getSession(input.checkout_session_id));
  if (!session || session.id !== input.checkout_session_id)
    throw new Error("Checkout session not found.");
  if (
    !input.whop_payment_id ||
    !Number.isSafeInteger(input.amount_collected) ||
    input.amount_collected <= 0 ||
    !Number.isFinite(Date.parse(input.paid_at))
  )
    throw new Error("Invalid confirmed payment.");
  const expected =
    session.checkout_type === "deposit"
      ? [session.deposit_amount]
      : session.plan.installments;
  if (!expected.includes(input.amount_collected))
    throw new Error("Payment amount does not match its checkout.");
  const catalog = options.catalog || (await getCatalog());
  const contact = catalog.prospects.find((p) => p.id === session.prospect_id);
  const offer =
    session.checkout_type === "sale"
      ? catalog.offers.find((o) => o.id === session.offer_id) || null
      : null;
  if (
    !contact ||
    contact.ghl_contact_id !== session.metadata.ghl_contact_id ||
    (session.checkout_type === "sale" && !offer)
  )
    throw new Error("Payment context is incomplete or mismatched.");
  const payment: PaymentRecord = {
    id: randomUUID(),
    checkout_session_id: session.id,
    whop_payment_id: input.whop_payment_id,
    payment_type: session.payment_type,
    amount_collected: input.amount_collected,
    contract_value: session.contract_value,
    is_pif:
      session.checkout_type === "sale" &&
      session.payment_type === "pif" &&
      input.amount_collected === session.contract_value,
    is_deposit: session.checkout_type === "deposit",
    status: "succeeded",
    paid_at: input.paid_at,
    created_at: new Date().toISOString(),
  };
  const store = options.store || paymentStore();
  const persisted = await store.record(session, payment); // Always persist money before any downstream action.
  const live =
    session.mode === "live" && process.env.PAYMENT_AUTOMATION_MODE === "real";
  const context: Context = {
    session,
    payment,
    contact,
    offer,
    live,
    notification: {
      prospect_name: session.metadata.prospect_name || contact.full_name,
      email: session.metadata.email || contact.email,
      phone: session.metadata.phone || contact.phone,
      closer: session.metadata.closer_name,
      amount_collected: input.amount_collected,
      contract_value: session.contract_value,
      offer: session.metadata.offer_name,
      payment_type: session.payment_type || "deposit",
      ...(session.checkout_type === "deposit"
        ? { follow_up_at: session.follow_up_at, time_zone: session.time_zone }
        : {}),
      whop_payment_id: input.whop_payment_id,
      ghl_contact_id: session.metadata.ghl_contact_id,
      ghl_opportunity_id: session.metadata.ghl_opportunity_id,
    },
  };
  const downstream =
    session.checkout_type === "deposit"
      ? await processDepositPayment(context, store, options.services)
      : await processNewCustomer(context, store, options.services);
  return {
    received: true,
    mode: session.mode,
    payment: { ...persisted, checkout_type: session.checkout_type },
    downstream,
  };
}
