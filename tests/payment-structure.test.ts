import test from "node:test";
import assert from "node:assert/strict";
import { callFieldValues, protectExistingCallCash } from "../lib/call-fields-sync";
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

test("non-sales preserve the existing CRM structure; unknown sold plans are not invented", () => {
  for (const outcome of ["deposit", "follow_up", "no_sale", "unqualified", null] as const)
    assert.equal(structure({ outcome, payment_type: "pif" }), undefined);
  assert.equal(structure({ outcome: "sold" }), "");
});


test("no-show, cancelled and rescheduled updates cannot zero existing financial fields", () => {
  const financialIds = ["zEhU8JWInYrH6IqUCzDL", "4o5MFBZYoNM0XPjr0dxs", "DBBnV2FF6RxWT3OwwveE", "ZKCL3fJBAIBwv8YCXxz2"];
  for (const attendance of ["no_show", "cancelled", "rescheduled"] as const) {
    const fields = callFieldValues({ attendance, outcome: null, notes: "", created_at: "2026-10-21T10:00:00Z", closer_name: "TEST" } as CallRecord, 0);
    assert.equal(fields.some(f => financialIds.includes(f.id)), false);
    assert.ok(fields.some(f => f.id === "Rn3fLeiuPVb5aXuNdN8T"));
  }
});

test("unpaid deposits preserve cash; confirmed deposits update cash without clearing investment or plan", () => {
  const record = { attendance: "attended", outcome: "deposit", notes: "", created_at: "2026-10-21T10:00:00Z", closer_name: "TEST" } as CallRecord;
  assert.equal(callFieldValues(record, 0).some(f => f.id === "DBBnV2FF6RxWT3OwwveE"), false);
  const confirmed = callFieldValues(record, 50000, "2026-10-21");
  assert.equal(confirmed.find(f => f.id === "DBBnV2FF6RxWT3OwwveE")?.fieldValue, 500);
  assert.equal(confirmed.some(f => f.id === "4o5MFBZYoNM0XPjr0dxs"), false);
});


test("saving a sold call cannot replace positive CRM cash with due-today or clear its receipt date", () => {
  const fields = [{ id: "DBBnV2FF6RxWT3OwwveE", fieldValue: 800 }, { id: "ZKCL3fJBAIBwv8YCXxz2", fieldValue: "" }];
  assert.deepEqual(protectExistingCallCash(fields, [{ id: "DBBnV2FF6RxWT3OwwveE", value: 1600 }]), []);
  assert.deepEqual(protectExistingCallCash(fields, []), [fields[0]]);
  assert.deepEqual(protectExistingCallCash(fields, [{ id: "DBBnV2FF6RxWT3OwwveE", value: 0 }]), [fields[0]]);
});
