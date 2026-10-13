import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlan } from "../lib/payments";
for (const price of [199700, 299700, 499700])
  for (const type of ["pif", "two", "three"] as const)
    test(`${price} ${type} preserves every cent`, () => {
      const plan = calculatePlan(price, type);
      assert.equal(
        plan.installments.reduce((sum, n) => sum + n, 0),
        price,
      );
      assert.equal(plan.amountDueToday + plan.remaining, price);
      assert.ok(
        Math.max(...plan.installments) - Math.min(...plan.installments) <= 1,
      );
    });
test("custom plan keeps deposit separate from contract", () => {
  const plan = calculatePlan(199700, "custom", {
    dueToday: 99700,
    remainingPayments: 2,
    futureAmount: 50000,
    firstDate: "2099-01-01",
  });
  assert.equal(plan.amountDueToday, 99700);
  assert.equal(plan.remaining, 100000);
});
test("invalid custom totals are rejected", () =>
  assert.throws(
    () =>
      calculatePlan(199700, "custom", {
        dueToday: 50000,
        remainingPayments: 2,
        futureAmount: 50000,
        firstDate: "2099-01-01",
      }),
    /equal/,
  ));
test("past dates and zero payments are rejected", () => {
  assert.throws(
    () =>
      calculatePlan(199700, "custom", {
        dueToday: 99700,
        remainingPayments: 2,
        futureAmount: 50000,
        firstDate: "2020-01-01",
      }),
    /future/,
  );
  assert.throws(() =>
    calculatePlan(199700, "custom", {
      dueToday: 99700,
      remainingPayments: 0,
      futureAmount: 50000,
      firstDate: "2099-01-01",
    }),
  );
});
