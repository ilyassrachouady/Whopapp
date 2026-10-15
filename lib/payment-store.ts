import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { getSupabase, saveSession } from "./supabase";
import type { CheckoutSession, PaymentRecord } from "./types";
export interface ActionReceipt {
  status: string;
  [key: string]: unknown;
}
export interface PaymentStore {
  record(
    session: CheckoutSession,
    payment: PaymentRecord,
  ): Promise<{ total: number; duplicate: boolean }>;
  action(
    key: string,
    sessionId: string,
    paymentId: string,
    run: (idempotencyKey: string) => Promise<ActionReceipt>,
  ): Promise<ActionReceipt>;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function atomicJson(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, file);
}
async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
// File-backed storage is for local mock tests only. Vercel requires Supabase.
async function localTransaction<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  if (process.env.VERCEL)
    throw new Error("Configure Supabase for durable payment processing.");
  const directory = path.join(process.cwd(), ".data", "payment-processing");
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, "transaction.lock");
  let acquired = false;
  for (let i = 0; i < 100; i++) {
    try {
      await writeFile(lock, String(Date.now()), { flag: "wx" });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 30000) await unlink(lock);
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!acquired) throw new Error("Payment storage is busy; retry delivery.");
  try {
    return await run(directory);
  } finally {
    await unlink(lock);
  }
}
export function paymentStore(): PaymentStore {
  return {
    async record(session, payment) {
      const db = getSupabase();
      if (db) {
        const { data, error } = await db.rpc("record_payment", {
          session_id: session.id,
          payment_id: payment.whop_payment_id,
          collected: payment.amount_collected,
          payment_paid_at: payment.paid_at,
        });
        if (error) throw new Error("Could not persist the confirmed payment.");
        return {
          total: Number(data.cash_collected),
          duplicate: Boolean(data.duplicate),
        };
      }
      const result = await localTransaction(async (directory) => {
        const file = path.join(directory, "payments.json");
        const records = (await readJson<PaymentRecord[]>(file)) || [];
        const existing = records.find(
          (p) => p.whop_payment_id === payment.whop_payment_id,
        );
        if (
          existing &&
          (existing.checkout_session_id !== session.id ||
            existing.amount_collected !== payment.amount_collected)
        )
          throw new Error(
            "Payment replay does not match its original checkout and amount.",
          );
        const previous = records.filter(
          (p) => p.checkout_session_id === session.id,
        );
        const total =
          previous.reduce((sum, p) => sum + p.amount_collected, 0) +
          (existing ? 0 : payment.amount_collected);
        const limit =
          session.checkout_type === "deposit"
            ? session.deposit_amount
            : session.contract_value;
        if (
          total > limit ||
          (!existing && previous.length >= session.installment_count)
        )
          throw new Error("Payment exceeds the agreed checkout schedule.");
        if (!existing) {
          records.push(payment);
          await atomicJson(file, records);
        }
        session.status = total >= limit ? "paid" : "partially_paid";
        await saveSession(session);
        return { total, duplicate: Boolean(existing) };
      });
      return result;
    },
    async action(key, sessionId, paymentId, run) {
      const db = getSupabase();
      const token = randomUUID();
      if (db) {
        const { data, error } = await db.rpc("claim_payment_action", {
          action_key: key,
          session_id: sessionId,
          payment_id: paymentId,
          claim_token: token,
        });
        if (error) throw new Error("Could not claim the payment action.");
        if (data.completed) return data.result as ActionReceipt;
        if (!data.claimed)
          throw new Error("Payment action is already running; retry delivery.");
        try {
          const result = await run(key);
          const { error: saveError, data: saved } = await db
            .from("payment_actions")
            .update({ status: "completed", result, lease_until: null })
            .eq("action_key", key)
            .eq("claim_token", token)
            .select("action_key");
          if (saveError || !saved?.length)
            throw new Error("Could not save payment action receipt.");
          return result;
        } catch (error) {
          await db
            .from("payment_actions")
            .update({ status: "failed", lease_until: null })
            .eq("action_key", key)
            .eq("claim_token", token);
          throw error;
        }
      }
      const claim = await localTransaction(async (directory) => {
        const file = path.join(directory, `action-${hash(key)}.json`);
        const existing = await readJson<{
          status: string;
          result: ActionReceipt;
          lease_until: number;
        }>(file);
        if (existing?.status === "completed")
          return { file, completed: existing.result };
        if (existing?.status === "running" && existing.lease_until > Date.now())
          throw new Error("Payment action is already running; retry delivery.");
        await atomicJson(file, {
          key,
          sessionId,
          paymentId,
          status: "running",
          claim_token: token,
          lease_until: Date.now() + 300000,
        });
        return { file, completed: null };
      });
      if (claim.completed) return claim.completed;
      try {
        const result = await run(key);
        await localTransaction(async () =>
          atomicJson(claim.file, {
            key,
            sessionId,
            paymentId,
            status: "completed",
            result,
          }),
        );
        return result;
      } catch (error) {
        await localTransaction(async () =>
          atomicJson(claim.file, {
            key,
            sessionId,
            paymentId,
            status: "failed",
          }),
        );
        throw error;
      }
    },
  };
}
