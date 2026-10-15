import type { CustomPlan, PaymentPlan, PaymentType, Offer } from "./types";
export function installmentContract(valueOrOffer: number | Offer) {
  if (typeof valueOrOffer === "number") return valueOrOffer;
  const totals = [
    valueOrOffer.paymentOptions?.two?.total,
    valueOrOffer.paymentOptions?.three?.total,
  ].filter((total): total is number => !!total);
  if (totals.length && totals.every((total) => total === totals[0]))
    return totals[0];
  return valueOrOffer.price;
}
export function customFuturePayments(
  contract: number,
  dueToday: number,
  remainingPayments: number,
) {
  if (
    !Number.isSafeInteger(contract) ||
    contract <= 0 ||
    !Number.isSafeInteger(dueToday) ||
    dueToday <= 0 ||
    dueToday >= contract ||
    !Number.isInteger(remainingPayments) ||
    remainingPayments < 1 ||
    remainingPayments > 24
  )
    throw new Error(
      "Enter an amount due today below the contract total and 1–24 future payments.",
    );
  const balance = contract - dueToday;
  const base = Math.floor(balance / remainingPayments);
  if (base < 1)
    throw new Error(
      "Enter a smaller amount due today or fewer future payments.",
    );
  const extra = balance - base * remainingPayments;
  return Array.from(
    { length: remainingPayments },
    (_, index) => base + (index < extra ? 1 : 0),
  );
}
export function balancedCustom(
  valueOrOffer: number | Offer,
): CustomPlan {
  const contract = installmentContract(valueOrOffer);
  const remainingPayments = 2;
  const dueToday = contract - Math.floor(contract / 3) * remainingPayments;
  const future = customFuturePayments(contract, dueToday, remainingPayments);
  return {
    dueToday,
    remainingPayments,
    futureAmount: future[0],
    firstDate: "",
  };
}
export function calculatePlan(
  valueOrOffer: number | Offer,
  type: PaymentType,
  custom?: CustomPlan,
): PaymentPlan {
  const offer = typeof valueOrOffer === "number" ? undefined : valueOrOffer;
  const value =
    typeof valueOrOffer === "number" ? valueOrOffer : valueOrOffer.price;
  const preset = type !== "custom" ? offer?.paymentOptions?.[type] : undefined;
  if (preset) {
    if (
      preset.total !== preset.installments * preset.installmentAmount ||
      preset.total <= 0
    )
      throw new Error("Invalid offer payment configuration.");
    return {
      type,
      contractValue: preset.total,
      amountDueToday: preset.installmentAmount,
      remaining: preset.total - preset.installmentAmount,
      paymentCount: preset.installments,
      installments: Array(preset.installments).fill(preset.installmentAmount),
    };
  }
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Invalid contract value.");
  if (type === "custom") {
    const contract = installmentContract(valueOrOffer);
    const future = custom
      ? customFuturePayments(
          contract,
          custom.dueToday,
          custom.remainingPayments,
        )
      : undefined;
    if (!custom || !future)
      throw new Error(
        "Enter an amount due today below the contract total and 1–24 future payments.",
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
      contractValue: contract,
      amountDueToday: custom.dueToday,
      remaining: contract - custom.dueToday,
      paymentCount: custom.remainingPayments + 1,
      installments: [custom.dueToday, ...future],
      firstDate: custom.firstDate,
    };
  }
  const count = type === "two" ? 2 : type === "three" ? 3 : 1;
  const base = Math.floor(value / count);
  const installments = [
    value - base * (count - 1),
    ...Array(count - 1).fill(base),
  ];
  return {
    type,
    contractValue: value,
    amountDueToday: installments[0],
    remaining: value - installments[0],
    paymentCount: count,
    installments,
  };
}
