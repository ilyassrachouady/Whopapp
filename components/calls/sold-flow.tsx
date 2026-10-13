"use client";
import {
  Check,
  GraduationCap,
  BriefcaseBusiness,
  CreditCard,
} from "lucide-react";
import { offers, money, paymentLabels } from "@/lib/config";
import { calculatePlan } from "@/lib/payments";
import type { CustomPlan, PaymentPlan, PaymentType } from "@/lib/types";
interface SoldFlowProps {
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
  return (
    <>
      <section className="form-section">
        <div className="section-heading">
          <span className="step">03</span>
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
          <span className="step">04</span>
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
                  ? "Set your terms"
                  : `${money(calculatePlan(offer.price, type).amountDueToday)} ${type === "pif" ? "today" : "/ payment"}`}
              </small>
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
                  setCustom({
                    ...custom,
                    dueToday: Math.round(Number(e.target.value) * 100),
                  });
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
                  setCustom({
                    ...custom,
                    remainingPayments: Number(e.target.value),
                  });
                  change();
                }}
              />
            </label>
            <label>
              Future payment amount ($)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={custom.futureAmount / 100}
                onChange={(e) => {
                  setCustom({
                    ...custom,
                    futureAmount: Math.round(Number(e.target.value) * 100),
                  });
                  change();
                }}
              />
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
                  : ", billed monthly"}
                . No interest added.
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
