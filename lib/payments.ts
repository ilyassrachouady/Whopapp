import type { CustomPlan, PaymentPlan, PaymentType } from "./types";
export function calculatePlan(
  value: number,
  type: PaymentType,
  custom?: CustomPlan,
): PaymentPlan {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Invalid contract value.");
  if (type === "custom") {
    if (
      !custom ||
      !Number.isSafeInteger(custom.dueToday) ||
      custom.dueToday <= 0 ||
      !Number.isInteger(custom.remainingPayments) ||
      custom.remainingPayments < 1 ||
      custom.remainingPayments > 24 ||
      !Number.isSafeInteger(custom.futureAmount) ||
      custom.futureAmount <= 0
    )
      throw new Error("Enter a positive deposit and 1–24 future payments.");
    if (
      custom.dueToday + custom.remainingPayments * custom.futureAmount !==
      value
    )
      throw new Error(
        "Your deposit and future payments must equal the contract value.",
      );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(custom.firstDate) ||
      !Number.isFinite(Date.parse(custom.firstDate)) ||
      new Date(custom.firstDate).toISOString().slice(0, 10) !==
        custom.firstDate ||
      custom.firstDate <= new Date().toISOString().slice(0, 10)
    )
      throw new Error("Choose a future date for the next payment.");
    return {
      type,
      amountDueToday: custom.dueToday,
      remaining: value - custom.dueToday,
      paymentCount: custom.remainingPayments + 1,
      installments: [
        custom.dueToday,
        ...Array(custom.remainingPayments).fill(custom.futureAmount),
      ],
      firstDate: custom.firstDate,
    };
  }
  const count = type === "two" ? 2 : type === "three" ? 3 : 1;
  const base = Math.floor(value / count);
  const installments = Array.from(
    { length: count },
    (_, i) => base + (i < value % count ? 1 : 0),
  );
  return {
    type,
    amountDueToday: installments[0],
    remaining: value - installments[0],
    paymentCount: count,
    installments,
  };
}
