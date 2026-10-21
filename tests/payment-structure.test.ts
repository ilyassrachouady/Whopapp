import test from "node:test";
import assert from "node:assert/strict";
import { callFieldValues } from "../lib/call-fields-sync";
import type { CallRecord } from "../lib/types";

const structure = (record: Partial<CallRecord>, cash = 0) => callFieldValues({
  attendance: "attended", notes: "", created_at: "2026-10-21T10:00:00Z",
  closer_name: "TEST", ...record,
} as CallRecord, cash).find(f => f.id === (process.env.GHL_PAYMENT_STRUCTURE_FIELD_ID || "zEhU8JWInYrH6IqUCzDL"))?.fieldValue;

test("agreed payment structure maps PIF and installment plans without requiring a receipt", () => {
  for (const payment_type of ["pif", "two", "three", "custom"] as const) {
    const expected = payment_type === "pif" ? "Pay in Full (PIF)" : "Manual Payment Plan";
    assert.equal(structure({ outcome: "sold", payment_type }), expected);
    assert.equal(structure({ outcome: "sold", payment_type }, 10000), expected);
  }
});

test("non-sales and unknown plans clear the latest-call structure rather than inventing a plan", () => {
  for (const outcome of ["deposit", "follow_up", "no_sale", "unqualified", null] as const)
    assert.equal(structure({ outcome, payment_type: "pif" }), "");
  assert.equal(structure({ outcome: "sold" }), "");
});
