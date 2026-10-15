import { test } from "node:test";
import assert from "node:assert/strict";
import { usdCents, validateWhopPlan } from "../lib/whop-validation";
import { calculatePlan } from "../lib/payments";
const base = {
  currency: "usd",
  initial_price_due: { amount: "1997.00", currency: "usd" },
  renewal_price: 0,
  plan_type: "one_time",
  billing_period: null,
  split_pay_required_payments: null,
  trial_period_days: null,
  collect_tax: false,
};
test("Whop exact decimal amounts preserve cents", () => {
  assert.equal(usdCents("665.66"), 66566);
  assert.equal(usdCents("1997"), 199700);
  for (const amount of ["-1", "1.999", "NaN", "1e3"])
    assert.throws(() => usdCents(amount));
});
test("PIF rejects a mismatched Whop price, currency, or billing type", () => {
  const plan = calculatePlan(199700, "pif");
  assert.doesNotThrow(() => validateWhopPlan(base, plan));
  assert.throws(
    () =>
      validateWhopPlan(
        { ...base, initial_price_due: { amount: "199.70", currency: "usd" } },
        plan,
      ),
    /price/,
  );
  assert.throws(() => validateWhopPlan({ ...base, currency: "eur" }, plan));
  assert.throws(() =>
    validateWhopPlan({ ...base, plan_type: "renewal" }, plan),
  );
  assert.throws(() => validateWhopPlan({ ...base, collect_tax: true }, plan));
});
test("split payments use a uniform renewal and preserve contract value exactly", () => {
  const plan = calculatePlan(199700, "three");
  assert.deepEqual(plan.installments, [66568, 66566, 66566]);
  const provider = {
    ...base,
    initial_price_due: { amount: "665.68", currency: "usd" },
    renewal_price: 665.66,
    plan_type: "renewal",
    billing_period: 30,
    split_pay_required_payments: 3,
  };
  assert.doesNotThrow(() => validateWhopPlan(provider, plan));
  assert.throws(() =>
    validateWhopPlan({ ...provider, split_pay_required_payments: null }, plan),
  );
  assert.throws(() =>
    validateWhopPlan({ ...provider, renewal_price: 665.67 }, plan),
  );
});
