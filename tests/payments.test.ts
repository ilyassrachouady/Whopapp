import { test } from "node:test";
import assert from "node:assert/strict";
import { offers } from "../lib/config";
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
        Math.max(...plan.installments) - Math.min(...plan.installments) <
          plan.paymentCount,
      );
    });
test("custom plan keeps deposit separate from contract", () => {
  const plan = calculatePlan(199700, "custom", {
    dueToday: 99700,
    remainingPayments: 2,
    futureAmount: 1,
    firstDate: "2099-01-01",
  });
  assert.equal(plan.amountDueToday, 99700);
  assert.equal(plan.remaining, 100000);
  assert.deepEqual(plan.installments, [99700, 50000, 50000]);
});
test("coaching custom plans use the 2400 installment total and calculate future payments", () => {
  const plan = calculatePlan(offers[0], "custom", {
    dueToday: 100000,
    remainingPayments: 4,
    futureAmount: 1,
    firstDate: "2099-01-01",
  });
  assert.equal(plan.contractValue, 240000);
  assert.deepEqual(plan.installments, [100000, 35000, 35000, 35000, 35000]);
});
test("custom future payments absorb leftover cents", () => {
  const plan = calculatePlan(199700, "custom", {
    dueToday: 100000,
    remainingPayments: 3,
    futureAmount: 1,
    firstDate: "2099-01-01",
  });
  assert.deepEqual(plan.installments, [100000, 33234, 33233, 33233]);
  assert.equal(
    plan.installments.reduce((sum, amount) => sum + amount, 0),
    199700,
  );
});
test("a deposit at or above the contract is rejected", () =>
  assert.throws(
    () =>
      calculatePlan(offers[0], "custom", {
        dueToday: 240000,
        remainingPayments: 2,
        futureAmount: 1,
        firstDate: "2099-01-01",
      }),
    /contract total/,
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
