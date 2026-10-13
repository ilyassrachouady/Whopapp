import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import { prospects, closers } from "./config";
import { getSession, getSupabase } from "./supabase";
import { completeCallSchema, resolveSchedule } from "./call-validation";
import type { CallRecord } from "./types";
// Single submission boundary. Future GHL/task/reporting writes consume this pending record.
// No live CRM writes are performed by this MVP.
export async function completeCall(
  raw: unknown,
): Promise<{ record: CallRecord; duplicate: boolean }> {
  const input = completeCallSchema.parse(raw);
  const prospect = prospects.find((p) => p.id === input.prospectId),
    closer = closers.find((c) => c.id === input.closerId);
  if (!prospect || !closer)
    throw new Error("Select a valid prospect and closer.");
  const db = getSupabase();
  const key = createHash("sha256").update(prospect.call_id).digest("hex");
  const directory = path.join(process.cwd(), ".data", "calls");
  const file = path.join(directory, `${key}.json`);
  // A retry returns the original completed call rather than recording another outcome.
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
    if (data) return { record: data, duplicate: true };
  } else {
    if (process.env.VERCEL)
      throw new Error("Configure Supabase for persistent call storage.");
    try {
      const record: CallRecord = JSON.parse(await readFile(file, "utf8"));
      return { record, duplicate: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const base = {
    id: randomUUID(),
    prospect_id: prospect.id,
    prospect_name: prospect.full_name,
    ghl_contact_id: prospect.ghl_contact_id,
    ghl_opportunity_id: prospect.ghl_opportunity_id,
    closer_id: closer.id,
    closer_name: closer.name,
    call_id: prospect.call_id,
    appointment_id: prospect.appointment_id || prospect.call_id,
    lead_source: prospect.lead_source,
    trakyo_id: prospect.trakyo_id,
    utm_source: prospect.utm_source,
    utm_medium: prospect.utm_medium,
    utm_campaign: prospect.utm_campaign,
    notes: input.notes,
    created_at: new Date().toISOString(),
    sync_status: "pending" as const,
    mode: "mock" as const,
  };
  let record: CallRecord;
  if (input.call_outcome === "sold") {
    const checkout = await getSession(input.checkout_session_id);
    if (
      !checkout ||
      checkout.prospect_id !== prospect.id ||
      checkout.closer_id !== closer.id ||
      checkout.call_id !== prospect.call_id
    )
      throw new Error(
        "Generate a payment link for this prospect and closer first.",
      );
    record = {
      ...base,
      call_outcome: "sold",
      checkout_session_id: checkout.id,
      offer_id: checkout.offer_id,
      offer_name: checkout.metadata.offer_name,
      contract_value: checkout.contract_value,
      payment_type: checkout.payment_type,
      amount_due_today: checkout.amount_due_today,
      checkout_url: checkout.checkout_url,
      whop_checkout_id: checkout.whop_checkout_id,
    };
  } else if (input.call_outcome === "follow_up") {
    const schedule = resolveSchedule(input);
    record = {
      ...base,
      call_outcome: "follow_up",
      follow_up_date: input.follow_up_date,
      follow_up_time: input.follow_up_time,
      follow_up_at: schedule.follow_up_at,
      time_zone: input.time_zone,
      follow_up_reason: input.follow_up_reason,
      next_step: input.next_step,
    };
  } else if (input.call_outcome === "no_show") {
    const schedule = input.reschedule_needed ? resolveSchedule(input) : null;
    record = {
      ...base,
      call_outcome: "no_show",
      reschedule_needed: input.reschedule_needed,
      ...(input.reschedule_needed
        ? {
            follow_up_date: input.follow_up_date,
            follow_up_time: input.follow_up_time,
            follow_up_at: schedule!.follow_up_at,
            time_zone: input.time_zone,
          }
        : {}),
    };
  } else
    record = {
      ...base,
      call_outcome: input.call_outcome,
      loss_reason: input.loss_reason,
    };
  if (db) {
    const row: Record<string, unknown> = { ...record };
    const { error } = await db.from("call_records").insert(row);
    if (error) {
      if (error.code === "23505") {
        const { data } = await db
          .from("call_records")
          .select("*")
          .eq("call_id", prospect.call_id)
          .single();
        if (data) return { record: data, duplicate: true };
      }
      throw new Error("Could not save this call. Please retry.");
    }
  } else {
    await mkdir(directory, { recursive: true });
    const temp = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(record));
    try {
      // Linking a fully written file is atomic and cannot replace an existing call.
      await link(temp, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        return {
          record: JSON.parse(await readFile(file, "utf8")),
          duplicate: true,
        };
      throw error;
    } finally {
      await unlink(temp);
    }
  }
  return { record, duplicate: false };
}
