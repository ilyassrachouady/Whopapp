import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prospects } from "../lib/config";
import { calculatePlan } from "../lib/payments";
import type { CheckoutSession } from "../lib/types";
test("completion persists every outcome, verifies sold ownership and replaces a later outcome for the same call", async () => {
  const previous = process.cwd();
  const temp = await mkdtemp(path.join(tmpdir(), "payment-desk-calls-"));
  process.chdir(temp);
  const added = Array.from({ length: 6 }, (_, i) => ({
    ...prospects[0],
    id: `test-${i}`,
    call_id: `test-call-${i}`,
    appointment_id: `test-appt-${i}`,
  }));
  prospects.push(...added);
  try {
    const { completeCall } = await import("../lib/calls");
    const { saveSession } = await import("../lib/supabase");
    const schedule = {
      follow_up_date: "2099-01-02",
      follow_up_time: "14:00",
      follow_up_at: "2099-01-02T14:00:00.000Z",
      time_zone: "UTC",
    };
    const base = {
      prospectId: added[0].id,
      closerId: "lewis",
      notes: "A useful note",
    };
    const noSale = await completeCall({
      ...base,
      attendance: "attended",
      outcome: "no_sale",
      loss_reason: "Price",
    });
    assert.equal(noSale.duplicate, false);
    assert.equal(noSale.record.outcome, "no_sale");
    assert.equal(noSale.record.ghl_contact_id, added[0].ghl_contact_id);
    assert.equal(noSale.record.appointment_id, added[0].appointment_id);
    assert.equal(noSale.record.sync_status, "pending");
    const later = await completeCall({
      ...base,
      attendance: "attended",
      outcome: "unqualified",
      loss_reason: "Budget",
    });
    assert.equal(later.duplicate, false);
    assert.equal(later.record.id, noSale.record.id);
    assert.equal(later.record.outcome, "unqualified");
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        completeCall({
          ...base,
          prospectId: added[1].id,
          attendance: "no_show",
          outcome: null,
          follow_up_required: false,
        }),
      ),
    );
    assert.equal(concurrent.filter((r) => !r.duplicate).length, 1);
    assert.equal(new Set(concurrent.map((r) => r.record.id)).size, 1);
    const follow = await completeCall({
      ...base,
      prospectId: added[2].id,
      attendance: "attended",
      outcome: "follow_up",
      ...schedule,
      follow_up_reason: "Speak with partner",
      next_step: "Call them tomorrow",
    });
    assert.equal(follow.record.outcome, "follow_up");
    assert.equal("checkout_session_id" in follow.record, false);
    const unqualified = await completeCall({
      ...base,
      prospectId: added[3].id,
      attendance: "attended",
      outcome: "unqualified",
      loss_reason: "Budget",
    });
    assert.equal(unqualified.record.outcome, "unqualified");
    const reschedule = await completeCall({
      ...base,
      prospectId: added[4].id,
      attendance: "no_show",
      outcome: null,
      follow_up_required: true,
      ...schedule,
    });
    assert.equal("follow_up_at" in reschedule.record, true);
    const session: CheckoutSession = {
      checkout_type: "sale",
      installment_count: 1,
      id: randomUUID(),
      prospect_id: added[5].id,
      closer_id: "lewis",
      offer_id: "coaching",
      contract_value: 199700,
      payment_type: "pif",
      amount_due_today: 199700,
      payment_count: 1,
      whop_checkout_id: "mock_test",
      checkout_url: "/checkout/test",
      call_id: added[5].call_id,
      trakyo_id: added[5].trakyo_id,
      status: "created",
      created_at: new Date().toISOString(),
      metadata: {
        ghl_contact_id: added[5].ghl_contact_id,
        ghl_opportunity_id: added[5].ghl_opportunity_id,
        closer_id: "lewis",
        closer_name: "Lewis Kirby",
        offer_id: "coaching",
        offer_name: "Coaching Program",
        contract_value: 199700,
        payment_type: "pif",
        call_id: added[5].call_id,
        trakyo_id: added[5].trakyo_id,
        lead_source: added[5].lead_source,
        utm_source: added[5].utm_source,
        utm_medium: added[5].utm_medium,
        utm_campaign: added[5].utm_campaign,
      },
      plan: calculatePlan(199700, "pif"),
      mode: "mock",
    };
    await saveSession(session);
    await assert.rejects(
      () =>
        completeCall({
          ...base,
          prospectId: added[5].id,
          closerId: "sofia",
          attendance: "attended",
          outcome: "sold",
          checkout_session_id: session.id,
        }),
      /matching demo checkout/,
    );
    await assert.rejects(
      () =>
        completeCall({
          ...base,
          prospectId: added[5].id,
          attendance: "attended",
          outcome: "sold",
          checkout_session_id: randomUUID(),
        }),
      /matching demo checkout/,
    );
    const sold = await completeCall({
      ...base,
      prospectId: added[5].id,
      attendance: "attended",
      outcome: "sold",
      checkout_session_id: session.id,
    });
    assert.equal(sold.record.outcome, "sold");
    assert.equal("amount_collected" in sold.record, false);
    assert.equal((await readdir(path.join(temp, ".data", "calls"))).length, 6);
  } finally {
    prospects.splice(prospects.length - added.length, added.length);
    process.chdir(previous);
    await rm(temp, { recursive: true, force: true });
  }
});
