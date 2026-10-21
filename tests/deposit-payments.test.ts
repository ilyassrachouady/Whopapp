import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDemoDepositCheckout, parseDepositAmount } from "../lib/deposits";
import {
  createDemoCheckout,
  completeDemoCall,
  calculatePlan,
} from "../lib/demo";
import { completeCallSchema } from "../lib/call-validation";
import { prospects, offers, closers } from "../lib/config";
import type { CompleteCallInput } from "../lib/types";
const schedule = {
  follow_up_date: "2099-01-02",
  follow_up_time: "14:00",
  time_zone: "Africa/Casablanca",
};
const makeDeposit = () =>
  createDemoDepositCheckout({
    prospect: prospects[0],
    closer: closers[0],
    amount: 50000,
    schedule,
    origin: "https://demo.example.com",
  });
const makeSale = (type: "pif" | "two" | "three" = "pif") =>
  createDemoCheckout({
    prospect: prospects[0],
    closer: closers[0],
    offer: offers[0],
    plan: calculatePlan(offers[0], type),
    origin: "https://demo.example.com",
  });
test("deposit accepts custom USD cents and requires a matching one-time checkout and future follow-up", () => {
  assert.equal(parseDepositAmount("753.21"), 75321);
  for (const value of ["0", "-500", "12.345", "1e3", "NaN"])
    assert.throws(() => parseDepositAmount(value));
  const checkout = makeDeposit();
  assert.equal(checkout.checkout_type, "deposit");
  assert.equal(checkout.contract_value, null);
  assert.equal(checkout.offer_id, null);
  assert.equal(checkout.payment_count, 1);
  assert.equal(checkout.status, "pending_payment");
  assert.equal(
    new URL(checkout.checkout_url).searchParams.get("amount"),
    "50000",
  );
  const input: CompleteCallInput = {
    prospectId: prospects[0].id,
    closerId: closers[0].id,
    notes: "Call again",
    attendance: "attended",
    outcome: "deposit",
    checkout_session_id: checkout.id,
    ...schedule,
  };
  assert.equal(
    completeCallSchema.safeParse({ ...input, follow_up_time: undefined })
      .success,
    false,
  );
  assert.throws(
    () => completeDemoCall(input, prospects[0], closers[0], makeSale()),
    /matching deposit/,
  );
  assert.throws(
    () =>
      completeDemoCall(
        { ...input, follow_up_time: "15:00" },
        prospects[0],
        closers[0],
        checkout,
      ),
    /Regenerate/,
  );
  const record = completeDemoCall(input, prospects[0], closers[0], checkout);
  assert.equal(record.outcome, "deposit");
  assert.equal(record.deposit_amount, 50000);
  assert.equal(record.follow_up_at, checkout.follow_up_at);
  assert.throws(
    () =>
      createDemoDepositCheckout({
        prospect: prospects[0],
        closer: closers[0],
        amount: 50000,
        schedule: { ...schedule, follow_up_date: "2020-01-02" },
        origin: "https://demo.example.com",
      }),
    /future/,
  );
});
test("confirmed payments persist, separate deposits, onboard first installments, and resume failed actions", async (t) => {
  const old = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "desk-payments-"));
  process.chdir(directory);
  try {
    const { saveSession } = await import("../lib/supabase");
    const { handleWhopPaymentSuccess } = await import("../lib/payment-success");
    const { processMockPayment } = await import("../lib/webhooks");
    const sale = makeSale();
    const two = makeSale("two");
    const deposit = makeDeposit();
    await Promise.all([
      saveSession(sale),
      saveSession(two),
      saveSession(deposit),
    ]);
    await t.test(
      "webhook authentication gates mock payment processing and real signatures",
      async () => {
        const { POST } = await import("../app/api/webhooks/whop/route");
        const oldMode = process.env.WHOP_MODE,
          oldSecret = process.env.WHOP_WEBHOOK_SECRET;
        process.env.WHOP_MODE = "mock";
        process.env.WHOP_WEBHOOK_SECRET = "desk_test_webhook_secret";
        try {
          const webhookSale = makeSale();
          await saveSession(webhookSale);
          const payload = {
            id: "evt_route",
            type: "payment.succeeded",
            checkout_session_id: webhookSale.id,
            whop_payment_id: "pay_route",
            amount_collected: 199700,
          };
          const request = (secret: string, body = payload) =>
            new Request("https://desk.example.com/api/webhooks/whop", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-mock-webhook-secret": secret,
              },
              body: JSON.stringify(body),
            });
          assert.equal((await POST(request("wrong"))).status, 401);
          assert.equal(
            (
              await POST(
                request("desk_test_webhook_secret", {
                  ...payload,
                  amount_collected: 0,
                }),
              )
            ).status,
            400,
          );
          const response = await POST(request("desk_test_webhook_secret"));
          assert.equal(response.status, 200);
          const result = await response.json();
          assert.equal(
            result.downstream.notification.channel,
            "#sales-new-clients",
          );
          const replay = await POST(request("desk_test_webhook_secret"));
          assert.equal((await replay.json()).payment.duplicate, true);
          process.env.WHOP_MODE = "real";
          assert.equal(
            (await POST(request("desk_test_webhook_secret"))).status,
            401,
          );
        } finally {
          if (oldMode === undefined) delete process.env.WHOP_MODE;
          else process.env.WHOP_MODE = oldMode;
          if (oldSecret === undefined) delete process.env.WHOP_WEBHOOK_SECRET;
          else process.env.WHOP_WEBHOOK_SECRET = oldSecret;
        }
      },
    );
    await t.test(
      "deposit call completion updates one stable record and preserves its checkout and follow-up",
      async () => {
        const { completeCall } = await import("../lib/calls");
        const input = {
          prospectId: prospects[0].id,
          closerId: closers[0].id,
          notes: "Follow-up arranged",
          attendance: "attended",
          outcome: "deposit",
          checkout_session_id: deposit.id,
          ...schedule,
        };
        const first = await completeCall(input);
        assert.equal(first.record.outcome, "deposit");
        assert.equal(first.record.follow_up_at, deposit.follow_up_at);
        assert.equal(first.record.deposit_amount, 50000);
        assert.equal(first.duplicate, false);
        const retry = await completeCall(input);
        assert.equal(retry.record.id, first.record.id);
        // Existing completions support edits; they update the same record.
        assert.equal(retry.duplicate, false);
        assert.equal((await readdir(path.join(directory, ".data", "calls"))).filter(name => name.endsWith(".json")).length, 1);
      },
    );
    await t.test(
      "PIF invokes Customer, new-client notification, welcome and pending Pablo access",
      async () => {
        const result = await processMockPayment({
          id: "evt_pif",
          checkout_session_id: sale.id,
          whop_payment_id: "pay_pif",
          amount_collected: 199700,
        });
        assert.equal(result.payment.total, 199700);
        assert.equal(result.payment.duplicate, false);
        assert.ok(
          "customer" in result.downstream && result.downstream.customer,
        );
        assert.ok(
          "notification" in result.downstream &&
            result.downstream.notification?.channel === "#sales-new-clients",
        );
        assert.ok(
          "welcome" in result.downstream &&
            result.downstream.welcome?.status === "mock",
        );
        assert.ok(
          "access" in result.downstream &&
            typeof result.downstream.access === "object" &&
            result.downstream.access.status === "pending_integration",
        );
      },
    );
    await t.test(
      "first installment onboards; later installments update cash without repeating onboarding",
      async () => {
        const first = await processMockPayment({
          id: "evt_two",
          checkout_session_id: two.id,
          whop_payment_id: "pay_two_1",
          amount_collected: 120000,
        });
        assert.equal(first.payment.total, 120000);
        assert.ok("customer" in first.downstream && first.downstream.customer);
        const second = await processMockPayment({
          id: "evt_two_2",
          checkout_session_id: two.id,
          whop_payment_id: "pay_two_2",
          amount_collected: 120000,
        });
        assert.equal(second.payment.total, 240000);
        const actions = await readdir(
          path.join(directory, ".data", "payment-processing"),
        );
        const records = await Promise.all(
          actions
            .filter((f) => f.startsWith("action-"))
            .map(async (f) =>
              JSON.parse(
                await readFile(
                  path.join(directory, ".data", "payment-processing", f),
                  "utf8",
                ),
              ),
            ),
        );
        assert.equal(records.filter((a) => a.sessionId === two.id).length, 4);
        const payments = JSON.parse(
          await readFile(
            path.join(
              directory,
              ".data",
              "payment-processing",
              "payments.json",
            ),
            "utf8",
          ),
        );
        assert.equal(
          payments.find(
            (p: { whop_payment_id: string }) =>
              p.whop_payment_id === "pay_two_1",
          ).is_pif,
          false,
        );
      },
    );
    await t.test(
      "deposit only calls sales-deposits and never Customer, welcome or access",
      async () => {
        const result = await processMockPayment({
          id: "evt_deposit",
          checkout_session_id: deposit.id,
          whop_payment_id: "pay_deposit",
          amount_collected: 50000,
        });
        assert.deepEqual(Object.keys(result.downstream), [
          "deposit_notification",
        ]);
        assert.equal(result.mode, "mock");
        assert.ok("deposit_notification" in result.downstream);
        assert.equal(result.downstream.deposit_notification.status, "mock");
        const payments = JSON.parse(
          await readFile(
            path.join(
              directory,
              ".data",
              "payment-processing",
              "payments.json",
            ),
            "utf8",
          ),
        );
        const record = payments.find(
          (p: { whop_payment_id: string }) =>
            p.whop_payment_id === "pay_deposit",
        );
        assert.equal(record.is_deposit, true);
        assert.equal(record.is_pif, false);
        assert.equal(record.contract_value, null);
      },
    );
    await t.test(
      "replay cannot reassign money, change amount or duplicate a payment",
      async () => {
        const repeat = await processMockPayment({
          id: "evt_retry",
          checkout_session_id: sale.id,
          whop_payment_id: "pay_pif",
          amount_collected: 199700,
        });
        assert.equal(repeat.payment.duplicate, true);
        assert.equal(repeat.payment.total, 199700);
        await assert.rejects(
          () =>
            processMockPayment({
              id: "evt_wrong",
              checkout_session_id: two.id,
              whop_payment_id: "pay_pif",
              amount_collected: 120000,
            }),
          /replay/,
        );
        await assert.rejects(
          () =>
            processMockPayment({
              id: "evt_wrong_amount",
              checkout_session_id: sale.id,
              whop_payment_id: "pay_bad",
              amount_collected: 200000,
            }),
          /amount/,
        );
        await assert.rejects(
          () =>
            processMockPayment({
              id: "evt_overpay",
              checkout_session_id: two.id,
              whop_payment_id: "pay_two_3",
              amount_collected: 120000,
            }),
          /exceeds/,
        );
      },
    );
    await t.test(
      "payment is durable before actions, and failed actions retry without repeating completed steps",
      async () => {
        const retrySale = makeSale();
        await saveSession(retrySale);
        const calls: string[] = [];
        let fail = true;
        const actions = {
          customer: async () => {
            calls.push("customer");
            return { status: "mock" };
          },
          newClient: async () => {
            calls.push("slack");
            if (fail) {
              fail = false;
              throw new Error("temporary slack failure");
            }
            return { status: "mock" };
          },
          deposit: async () => ({ status: "mock" }),
          welcome: async () => {
            calls.push("welcome");
            return { status: "mock" };
          },
          access: async () => {
            calls.push("access");
            return { status: "pending_integration" };
          },
        };
        const input = {
          checkout_session_id: retrySale.id,
          whop_payment_id: "pay_retry",
          amount_collected: 199700,
          paid_at: new Date().toISOString(),
        };
        await assert.rejects(
          () =>
            handleWhopPaymentSuccess(input, {
              session: retrySale,
              services: actions,
            }),
          /temporary/,
        );
        const payments = JSON.parse(
          await readFile(
            path.join(
              directory,
              ".data",
              "payment-processing",
              "payments.json",
            ),
            "utf8",
          ),
        );
        assert.equal(
          payments.filter(
            (p: { whop_payment_id: string }) =>
              p.whop_payment_id === "pay_retry",
          ).length,
          1,
        );
        const done = await handleWhopPaymentSuccess(input, {
          session: retrySale,
          services: actions,
        });
        assert.equal(done.payment.duplicate, true);
        assert.deepEqual(calls, [
          "customer",
          "slack",
          "slack",
          "welcome",
          "access",
        ]);
        await handleWhopPaymentSuccess(input, {
          session: retrySale,
          services: actions,
        });
        assert.equal(calls.length, 5);
      },
    );
  } finally {
    process.chdir(old);
    await rm(directory, { recursive: true, force: true });
  }
});
