import { test } from "node:test";
import assert from "node:assert/strict";
import { completeCallSchema, validateSchedule } from "../lib/call-validation";
const base = { prospectId: "john", closerId: "lewis", notes: "" };
const schedule = {
  follow_up_date: "2099-01-02",
  follow_up_time: "14:00",
  follow_up_at: "2099-01-02T14:00:00.000Z",
  time_zone: "UTC",
};
test("sold requires a saved checkout UUID", () => {
  assert.equal(
    completeCallSchema.safeParse({ ...base, call_outcome: "sold" }).success,
    false,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "sold",
      checkout_session_id: "ade2cbe6-a76e-4472-beca-9779d410324d",
    }).success,
    true,
  );
});
test("follow-up requires reason, schedule and a useful next step", () => {
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "follow_up",
      ...schedule,
      follow_up_reason: "Speak with partner",
      next_step: "Call again",
    }).success,
    true,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "follow_up",
      ...schedule,
      follow_up_reason: "Price",
      next_step: "",
    }).success,
    false,
  );
});
test("no-sale and unqualified reasons are scoped to the outcome", () => {
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "no_sale",
      loss_reason: "Price",
    }).success,
    true,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "unqualified",
      loss_reason: "Price",
    }).success,
    false,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "unqualified",
      loss_reason: "Budget",
    }).success,
    true,
  );
});
test("no-show requires a schedule only when rescheduling", () => {
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "no_show",
      reschedule_needed: false,
    }).success,
    true,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "no_show",
      reschedule_needed: true,
    }).success,
    false,
  );
  assert.equal(
    completeCallSchema.safeParse({
      ...base,
      call_outcome: "no_show",
      reschedule_needed: true,
      ...schedule,
    }).success,
    true,
  );
});
test("stale fields from another outcome are discarded", () => {
  const parsed = completeCallSchema.parse({
    ...base,
    call_outcome: "no_sale",
    loss_reason: "Price",
    checkout_session_id: "ade2cbe6-a76e-4472-beca-9779d410324d",
    ...schedule,
  });
  assert.equal("checkout_session_id" in parsed, false);
  assert.equal("follow_up_date" in parsed, false);
});
test("future schedule is checked against captured timezone", () => {
  assert.doesNotThrow(() => validateSchedule(schedule));
  assert.throws(
    () => validateSchedule({ ...schedule, follow_up_time: "15:00" }),
    /time zone/,
  );
  assert.throws(
    () =>
      validateSchedule({ ...schedule, follow_up_at: "2020-01-02T14:00:00Z" }),
    /future/,
  );
  assert.throws(() =>
    validateSchedule({ ...schedule, time_zone: "Not/AZone" }),
  );
});

test("wall-clock schedules resolve on the server independently of host timezone", async () => {
  const { resolveSchedule } = await import("../lib/call-validation");
  const result = resolveSchedule(
    {
      follow_up_date: "2026-10-14",
      follow_up_time: "14:00",
      time_zone: "Africa/Casablanca",
    },
    Date.parse("2026-10-13T00:00:00Z"),
  );
  assert.equal(result.follow_up_at, "2026-10-14T13:00:00.000Z");
  assert.throws(
    () =>
      resolveSchedule(
        {
          follow_up_date: "2026-03-08",
          follow_up_time: "02:30",
          time_zone: "America/New_York",
        },
        Date.parse("2026-01-01T00:00:00Z"),
      ),
    /time zone/,
  );
  assert.throws(
    () =>
      resolveSchedule({
        follow_up_date: "2099-02-30",
        follow_up_time: "14:00",
        time_zone: "UTC",
      }),
    /time zone/,
  );
});
