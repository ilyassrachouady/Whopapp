import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createDemoCheckout, calculatePlan } from "../lib/demo";
import { createDemoDepositCheckout } from "../lib/deposits";
import { prospects, closers, offers } from "../lib/config";
import type { CheckoutSession } from "../lib/types";
test("isolated PostgreSQL migration enforces sale/deposit payments, replay integrity and retry claims", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      await readFile(
        new URL("../supabase/setup-isolated.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec("set search_path=payment_desk,public;");
    for (const name of [
      "004_attendance_outcomes.sql",
      "005_deposits_and_payment_actions.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
    );
    const sale = createDemoCheckout({
      prospect: prospects[0],
      closer: closers[0],
      offer: offers[0],
      plan: calculatePlan(offers[0], "two"),
      origin: "https://demo.example.com",
    });
    const deposit = createDemoDepositCheckout({
      prospect: prospects[0],
      closer: closers[0],
      amount: 50000,
      schedule: {
        follow_up_date: "2099-01-02",
        follow_up_time: "14:00",
        time_zone: "UTC",
      },
      origin: "https://demo.example.com",
    });
    const insert = async (session: CheckoutSession) => {
      const keys = Object.keys(session),
        values = Object.values(session).map((value) =>
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value,
        );
      await db.query(
        `insert into checkout_sessions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
        values,
      );
    };
    await insert(sale);
    await insert(deposit);
    const record = async (id: string, paymentId: string, amount: number) =>
      (
        await db.query<{
          result: { cash_collected: number; duplicate: boolean };
        }>("select record_payment($1,$2,$3,now()) as result", [
          id,
          paymentId,
          amount,
        ])
      ).rows[0].result;
    assert.deepEqual(await record(sale.id, "pay_first", 120000), {
      cash_collected: 120000,
      contract_value: 240000,
      duplicate: false,
    });
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from checkout_sessions where id=$1",
          [sale.id],
        )
      ).rows[0].status,
      "partially_paid",
    );
    assert.equal((await record(sale.id, "pay_first", 120000)).duplicate, true);
    await assert.rejects(
      () => record(sale.id, "pay_first", 80000),
      /Mismatched/,
    );
    await assert.rejects(
      () => record(deposit.id, "pay_first", 50000),
      /Mismatched/,
    );
    await record(sale.id, "pay_second", 120000);
    await assert.rejects(() => record(sale.id, "pay_third", 120000), /exceeds/);
    await record(deposit.id, "pay_deposit", 50000);
    const p = (
      await db.query<{
        is_deposit: boolean;
        is_pif: boolean;
        contract_value: number | null;
      }>(
        "select is_deposit,is_pif,contract_value from payments where whop_payment_id='pay_deposit'",
      )
    ).rows[0];
    assert.deepEqual(p, {
      is_deposit: true,
      is_pif: false,
      contract_value: null,
    });
    const token = "a69c06e3-70ac-41a2-95ae-d32c12ab275f",
      other = "69e6eb73-37b7-4708-91c3-8b16e2b98af7";
    const claim = async (claimToken: string) =>
      (
        await db.query<{
          result: { claimed: boolean; completed: boolean; result?: unknown };
        }>("select claim_payment_action($1,$2,$3,$4) as result", [
          "sale:test:customer",
          sale.id,
          "pay_first",
          claimToken,
        ])
      ).rows[0].result;
    assert.equal((await claim(token)).claimed, true);
    assert.equal((await claim(other)).claimed, false);
    await db.query(
      "update payment_actions set status='failed' where action_key=$1",
      ["sale:test:customer"],
    );
    assert.equal((await claim(other)).claimed, true);
    await db.query(
      "update payment_actions set status='completed', result=$1::jsonb where action_key=$2",
      [JSON.stringify({ status: "mock" }), "sale:test:customer"],
    );
    assert.deepEqual(await claim(token), {
      claimed: false,
      completed: true,
      result: { status: "mock" },
    });
    const config = (
      await db.query<{ proconfig: string[] }>(
        "select proconfig from pg_proc where proname='record_payment'",
      )
    ).rows[0].proconfig;
    assert.ok(config.includes("search_path=payment_desk, public"));
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('service_role','payment_actions','UPDATE') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('anon','payment_actions','SELECT') as allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
