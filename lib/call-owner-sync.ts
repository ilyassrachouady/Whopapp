import "server-only";
import { assignContactOwner, ghlMode } from "./ghl";
import { getSupabase } from "./supabase";
import { OTHER_CLOSER_ID } from "./closer-selection";
import type { CallRecord } from "./types";
export interface AssignmentSync {
  status: "synced" | "failed" | "unchanged" | "mock";
  message?: string;
}
export async function syncCallOwner(
  record: CallRecord,
): Promise<AssignmentSync> {
  if (ghlMode() !== "real") return { status: "mock" };
  // External callers never clear or replace a CRM user assignment.
  if (record.closer_id === OTHER_CLOSER_ID) return { status: "unchanged" };
  const db = getSupabase();
  if (!db)
    return {
      status: "failed",
      message: "Call saved. Database unavailable for assignment sync.",
    };
  try {
    const { data: closer, error } = await db
      .from("closers")
      .select("ghl_user_id")
      .eq("id", record.closer_id)
      .single();
    if (error || !closer?.ghl_user_id)
      throw new Error("Saved closer has no GHL user mapping.");
    if (record.sync_status === "synced") return { status: "synced" };
    await assignContactOwner(record.ghl_contact_id, closer.ghl_user_id);
    const { error: saveError } = await db
      .from("call_records")
      .update({ sync_status: "synced", mode: "live" })
      .eq("id", record.id);
    if (saveError) throw saveError;
    record.sync_status = "synced";
    record.mode = "live";
    return { status: "synced" };
  } catch {
    await db
      .from("call_records")
      .update({ sync_status: "failed", mode: "live" })
      .eq("id", record.id);
    record.sync_status = "failed";
    record.mode = "live";
    return {
      status: "failed",
      message: "Call saved, but GHL assignment failed. Retry the assignment.",
    };
  }
}
