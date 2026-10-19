import { resolveCloser } from "./closer-selection";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import { getCatalog } from "./catalog";
import { getSession, getSupabase } from "./supabase";
import { completeCallSchema } from "./call-validation";
import { completeDemoCall } from "./demo";
import type { CallRecord } from "./types";

const CLEAR_OUTCOME_DETAILS = {
  checkout_session_id: null,
  offer_id: null,
  offer_name: null,
  contract_value: null,
  payment_type: null,
  deposit_amount: null,
  amount_due_today: null,
  checkout_url: null,
  whop_checkout_id: null,
  follow_up_date: null,
  follow_up_time: null,
  follow_up_at: null,
  time_zone: null,
  follow_up_reason: null,
  next_step: null,
  loss_reason: null,
  follow_up_required: null,
  cancellation_reason: null,
} as const;

// One latest report is stored per call_id. Completing that call again intentionally
// replaces the latest snapshot so GHL reflects the newest outcome, while Whop
// payments and GHL notes retain their own event history.
export async function completeCall(
  raw: unknown,
): Promise<{ record: CallRecord; duplicate: boolean }> {
  const input = completeCallSchema.parse(raw);
  const { prospects, closers } = await getCatalog();
  const prospect = prospects.find((p) => p.id === input.prospectId),
    closer = resolveCloser(closers, input.closerId, input.other_closer_name);
  if (!prospect || !closer)
    throw new Error("Select a valid prospect and closer.");

  const db = getSupabase();
  const key = createHash("sha256").update(prospect.call_id).digest("hex");
  const directory = path.join(process.cwd(), ".data", "calls");
  const file = path.join(directory, `${key}.json`);

  let existing: CallRecord | null = null;
  if (db) {
    const { data, error } = await db
      .from("call_records")
      .select("*")
      .eq("call_id", prospect.call_id)
      .maybeSingle();
    if (error)
      throw new Error(
        "Could not read call records. Apply the call records migration.",
      );
    existing = (data as CallRecord | null) || null;
  } else {
    if (process.env.VERCEL)
      throw new Error("Configure Supabase for persistent call storage.");
    try {
      existing = JSON.parse(await readFile(file, "utf8")) as CallRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const checkout =
    input.outcome === "sold" || input.outcome === "deposit"
      ? await getSession(input.checkout_session_id)
      : null;
  const fresh = completeDemoCall(input, prospect, closer, checkout);
  const record: CallRecord = existing ? { ...fresh, id: existing.id } : fresh;

  if (db) {
    const row: Record<string, unknown> = {
      ...CLEAR_OUTCOME_DETAILS,
      ...record,
    };

    if (existing) {
      const { error } = await db
        .from("call_records")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error("Could not update this call. Please retry.");
    } else {
      const { error } = await db.from("call_records").insert(row);
      if (error) {
        if (error.code === "23505") {
          const { data } = await db
            .from("call_records")
            .select("*")
            .eq("call_id", prospect.call_id)
            .single();
          if (data) return { record: data as CallRecord, duplicate: true };
        }
        throw new Error("Could not save this call. Please retry.");
      }
    }
  } else {
    await mkdir(directory, { recursive: true });
    const temp = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(record));
    if (existing) {
      await rename(temp, file);
    } else {
      try {
        // Preserve concurrent-submit protection for the first completion.
        await link(temp, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          return {
            record: JSON.parse(await readFile(file, "utf8")) as CallRecord,
            duplicate: true,
          };
        throw error;
      } finally {
        await unlink(temp).catch(() => undefined);
      }
    }
  }

  return { record, duplicate: false };
}
