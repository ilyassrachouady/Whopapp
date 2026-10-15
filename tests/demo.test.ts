import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoCheckout,
  completeDemoCall,
  calculatePlan,
} from "../lib/demo";
import { prospects, offers, closers } from "../lib/config";
test("public demo creates portable checkout previews and completes without a backend", () => {
  const checkout = createDemoCheckout({
    prospect: prospects[0],
    offer: offers[0],
    closer: closers[0],
    plan: calculatePlan(offers[0], "three"),
    origin: "https://demo.example.com",
  });
  assert.equal(new URL(checkout.checkout_url).pathname, "/demo-checkout");
  assert.equal(checkout.mode, "mock");
  const record = completeDemoCall(
    {
      prospectId: prospects[0].id,
      closerId: closers[0].id,
      notes: "",
      attendance: "attended",
      outcome: "sold",
      checkout_session_id: checkout.id,
    },
    prospects[0],
    closers[0],
    checkout,
  );
  assert.equal(record.outcome, "sold");
  assert.equal(record.mode, "mock");
});
test("public demo can complete no-sale without generating a checkout", () => {
  const record = completeDemoCall(
    {
      prospectId: prospects[0].id,
      closerId: closers[0].id,
      notes: "",
      attendance: "attended",
      outcome: "no_sale",
      loss_reason: "Price",
    },
    prospects[0],
    closers[0],
    null,
  );
  assert.equal(record.outcome, "no_sale");
  assert.equal("checkout_session_id" in record, false);
});

test("Coaching preset prices propagate to checkout metadata and completed reports", () => {
  for (const [type, total, due, remaining] of [
    ["pif", 199700, 199700, 0],
    ["two", 240000, 120000, 120000],
    ["three", 240000, 80000, 160000],
  ] as const) {
    const plan = calculatePlan(offers[0], type);
    assert.equal(plan.contractValue, total);
    assert.equal(plan.amountDueToday, due);
    assert.equal(plan.remaining, remaining);
    const checkout = createDemoCheckout({
      prospect: prospects[0],
      offer: offers[0],
      closer: closers[0],
      plan,
      origin: "https://demo.example.com",
    });
    assert.equal(checkout.contract_value, total);
    assert.equal(checkout.metadata.contract_value, total);
    const record = completeDemoCall(
      {
        prospectId: prospects[0].id,
        closerId: closers[0].id,
        notes: "",
        attendance: "attended",
        outcome: "sold",
        checkout_session_id: checkout.id,
      },
      prospects[0],
      closers[0],
      checkout,
    );
    assert.equal(record.contract_value, total);
  }
});
test("non-attendance reports have a null sales outcome and save relevant details only", () => {
  const schedule = {
    follow_up_date: "2099-01-02",
    follow_up_time: "14:00",
    time_zone: "UTC",
  };
  for (const attendance of ["no_show", "cancelled", "rescheduled"] as const) {
    const input = {
      prospectId: prospects[0].id,
      closerId: closers[0].id,
      notes: "",
      attendance,
      outcome: null,
      follow_up_required: true,
      cancellation_reason: "Prospect cancelled",
      ...schedule,
    };
    const record = completeDemoCall(input, prospects[0], closers[0], null);
    assert.equal(record.attendance, attendance);
    assert.equal(record.outcome, null);
    assert.equal(record.follow_up_at, "2099-01-02T14:00:00.000Z");
    assert.equal("checkout_session_id" in record, false);
    assert.equal("prospectId" in record, false);
  }
});
