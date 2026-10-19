import type { PaymentPlan } from "./types";
export function usdCents(amount: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error("Invalid USD amount from Whop.");
  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents))
    throw new Error("USD amount is out of range.");
  return cents;
}
interface ProviderPlan {
  currency: string;
  initial_price_due: { amount: string; currency: string };
  renewal_price: number;
  plan_type: string;
  billing_period: number | null;
  split_pay_required_payments: number | null;
  trial_period_days: number | null;
  collect_tax: boolean;
  tax_type?: string;
}
export function validateWhopPlan(
  provider: ProviderPlan,
  requested: PaymentPlan,
  _allowTestTax = false,
) {
  if (
    provider.currency !== "usd" ||
    provider.initial_price_due.currency !== "usd" ||
    usdCents(provider.initial_price_due.amount) !== requested.amountDueToday
  )
    throw new Error("The Whop plan price does not match the amount due today.");
  if (provider.trial_period_days)
    throw new Error("Use a Whop plan without a trial period for this checkout.");
  if (requested.type === "pif") {
    if (provider.plan_type !== "one_time")
      throw new Error("Pay in Full requires a one-time Whop plan.");
    return;
  }
  if (requested.type === "custom")
    throw new Error(
      "Live custom schedules require an individually verified Whop plan.",
    );
  if (
    provider.plan_type !== "renewal" ||
    provider.billing_period !== 30 ||
    provider.split_pay_required_payments !== requested.paymentCount ||
    Math.round(provider.renewal_price * 100) !== requested.installments[1] ||
    !requested.installments
      .slice(1)
      .every((n) => n === requested.installments[1])
  )
    throw new Error(
      "The Whop installment schedule does not match this payment option.",
    );
}
