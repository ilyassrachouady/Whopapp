import { resolveCloser } from "./closer-selection";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import { getCatalog } from "./catalog";
import { getSession, getSupabase } from "./supabase";
import { completeCallSchema } from "./call-validation";
import { completeDemoCall } from "./demo";
import type { CallRecord } from "./types";
// Single submission boundary. Future GHL/task/reporting writes consume this pending record.
// No live CRM writes are performed by this MVP.
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
  const checkout =
    input.outcome === "sold" || input.outcome === "deposit"
      ? await getSession(input.checkout_session_id)
      : null;
  const record = completeDemoCall(input, prospect, closer, checkout);
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
