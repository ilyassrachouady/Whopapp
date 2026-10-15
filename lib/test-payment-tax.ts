import { usdCents } from "./whop-validation";
export function verifyLocalTestAmount(payment: {
  subtotal: { currency: string; amount: string } | null;
  total: { currency: string; amount: string } | null;
  tax_amount: { currency: string; amount: string } | null;
  tax_behavior: string | null;
}, expected: number) {
  if (!payment.subtotal || !payment.total || payment.subtotal.currency !== "usd" || payment.total.currency !== "usd")
    throw new Error("Test payment currency or subtotal is missing.");
  const base = usdCents(payment.subtotal.amount), total = usdCents(payment.total.amount);
  if (payment.tax_amount && payment.tax_amount.currency !== "usd") throw new Error("Unexpected tax currency.");
  const tax = payment.tax_amount ? usdCents(payment.tax_amount.amount) : 0;
  if (base !== expected || total !== base + (payment.tax_behavior === "exclusive" ? tax : 0))
    throw new Error("Test payment total does not match its price and verified tax.");
  return base;
}
