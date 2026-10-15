"use client";
import {
  Check,
  GraduationCap,
  BriefcaseBusiness,
  CreditCard,
} from "lucide-react";
import { money, paymentLabels } from "@/lib/config";
import {
  calculatePlan,
  customFuturePayments,
  installmentContract,
} from "@/lib/payments";
import type { CustomPlan, PaymentPlan, PaymentType } from "@/lib/types";
interface SoldFlowProps {
  offers: import("@/lib/types").Offer[];
  offerId: string;
  setOfferId: (value: string) => void;
  paymentType: PaymentType;
  setPaymentType: (value: PaymentType) => void;
  custom: CustomPlan;
  setCustom: (value: CustomPlan) => void;
  plan: PaymentPlan | undefined;
  planError: string;
  change: () => void;
}
export function SoldFlow({
  offers,
  offerId,
  setOfferId,
  paymentType,
  setPaymentType,
  custom,
  setCustom,
  plan,
  planError,
  change,
}: SoldFlowProps) {
  const offer = offers.find((o) => o.id === offerId)!;
  const contract = installmentContract(offer);
  let futurePayments: number[] = [];
  if (paymentType === "custom") {
    try {
      futurePayments = customFuturePayments(
        contract,
        custom.dueToday,
        custom.remainingPayments,
      );
    } catch {
      futurePayments = [];
    }
  }
  const futureAmounts = [...new Set(futurePayments)];
  const futureLabel =
    futureAmounts.length === 1
      ? (futureAmounts[0] / 100).toFixed(2)
      : futureAmounts.length
        ? `${(Math.min(...futureAmounts) / 100).toFixed(2)} – ${(Math.max(...futureAmounts) / 100).toFixed(2)}`
        : "";
  return (
    <>
      <section className="form-section">
        <div className="section-heading">
          <span className="step">04</span>
          <h2>Choose an offer</h2>
        </div>
        <div className="offer-grid">
          {offers.map((o) => (
            <button
              key={o.id}
              className={`offer-card ${offerId === o.id ? "selected" : ""}`}
              onClick={() => {
                setOfferId(o.id);
                change();
              }}
              aria-pressed={offerId === o.id}
            >
              <div className="offer-top">
                <span
                  className={`offer-icon ${o.id === "sofia" ? "premium" : ""}`}
                >
                  {o.id === "coaching" ? (
                    <GraduationCap
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <BriefcaseBusiness
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="radio">
                  {offerId === o.id && <Check size={12} />}
                </span>
              </div>
              <span className="offer-badge">{o.badge}</span>
              <h3>{o.name}</h3>
              <p>{o.description}</p>
              <div className="offer-price">
                {money(o.price)} <span>USD</span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading">
          <span className="step">05</span>
          <h2>Payment structure</h2>
        </div>
        <div className="payment-grid">
          {(["pif", "two", "three", "custom"] as PaymentType[]).map((type) => (
            <button
              key={type}
              className={`payment-option ${paymentType === type ? "selected" : ""}`}
              aria-pressed={paymentType === type}
              onClick={() => {
                setPaymentType(type);
                change();
              }}
            >
              <span className="payment-option-top">
                <span className="radio">
                  {paymentType === type && <Check size={11} />}
                </span>
                {type === "pif" && <span className="pif-badge">PIF</span>}
              </span>
              <strong>
                {type === "custom" ? "Custom plan" : paymentLabels[type]}
              </strong>
              <small>
                {type === "custom"
                  ? "Future payments calculate automatically"
                  : type === "pif"
                    ? `${money(calculatePlan(offer, type).amountDueToday)} today`
                    : `${calculatePlan(offer, type).paymentCount} × ${money(calculatePlan(offer, type).amountDueToday)}`}
              </small>
              {type !== "pif" && (
                <small>
                  Total:{" "}
                  {money(
                    type === "custom"
                      ? contract
                      : calculatePlan(offer, type).contractValue,
                  )}
                </small>
              )}
            </button>
          ))}
        </div>
        {paymentType === "custom" && (
          <div className="custom-grid">
            <label>
              Amount due today ($)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={custom.dueToday / 100}
                onChange={(e) => {
                  const dueToday = Math.round(Number(e.target.value) * 100);
                  let futureAmount = custom.futureAmount;
                  try {
                    futureAmount = customFuturePayments(
                      contract,
                      dueToday,
                      custom.remainingPayments,
                    )[0];
                  } catch {
                    futureAmount = custom.futureAmount;
                  }
                  setCustom({ ...custom, dueToday, futureAmount });
                  change();
                }}
              />
            </label>
            <label>
              Remaining payments
              <input
                type="number"
                min="1"
                max="24"
                value={custom.remainingPayments}
                onChange={(e) => {
                  const remainingPayments = Number(e.target.value);
                  let futureAmount = custom.futureAmount;
                  try {
                    futureAmount = customFuturePayments(
                      contract,
                      custom.dueToday,
                      remainingPayments,
                    )[0];
                  } catch {
                    futureAmount = custom.futureAmount;
                  }
                  setCustom({ ...custom, remainingPayments, futureAmount });
                  change();
                }}
              />
            </label>
            <label>
              Future payment amount ($)
              <input
                readOnly
                aria-readonly="true"
                value={futureLabel}
                tabIndex={-1}
              />
              <span>Calculated from the {money(contract)} total.</span>
            </label>
            <label>
              First future payment
              <input
                type="date"
                value={custom.firstDate}
                onChange={(e) => {
                  setCustom({ ...custom, firstDate: e.target.value });
                  change();
                }}
              />
            </label>
          </div>
        )}
        {plan && (
          <div className="schedule-note">
            <CreditCard size={15} />
            {paymentType === "pif" ? (
              "One payment today. No remaining balance."
            ) : (
              <span>
                {money(plan.amountDueToday)} today, then{" "}
                {plan.installments.slice(1).map(money).join(" + ")}
                {plan.firstDate
                  ? ` starting ${plan.firstDate}`
                  : ", every 30 days"}
                .
              </span>
            )}
          </div>
        )}
        {planError && (
          <p className="error" role="alert">
            {planError}
          </p>
        )}
      </section>
    </>
  );
}
