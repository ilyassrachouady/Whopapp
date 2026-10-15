import "server-only";
import { getContact, ghlMode } from "./ghl";
import { getCloserRoster } from "./closer-roster";
import { getSupabase } from "./supabase";
export async function selectContact(contactId: string) {
  if (ghlMode() !== "real") throw Error("CRM not configured");
  const c = await getContact(contactId);
  if (!c || !("locationId" in c)) throw Error("Contact not found");
  const db = getSupabase();
  if (!db) throw Error("Database required");
  const { data: previous, error: readError } = await db
    .from("prospects")
    .select("*")
    .eq("ghl_contact_id", c.id)
    .maybeSingle();
  if (readError) throw readError;
  let callId = previous?.call_id;
  if (callId) {
    const { data: completed, error } = await db
      .from("call_records")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle();
    if (error) throw error;
    if (completed) callId = null;
  }
  const source = typeof c.source === "string" ? c.source : "GoHighLevel";
  const prospect = {
    id: previous?.id || c.id,
    full_name:
      c.name ||
      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
      c.email ||
      "Contact",
    email: c.email || "",
    phone: c.phone || "",
    ghl_contact_id: c.id,
    ghl_opportunity_id: previous?.ghl_opportunity_id || "",
    lead_source: source,
    call_id: callId || `desk_${crypto.randomUUID()}`,
    appointment_id: previous?.appointment_id || null,
    trakyo_id: previous?.trakyo_id || "",
    utm_source: previous?.utm_source || "",
    utm_medium: previous?.utm_medium || "",
    utm_campaign: previous?.utm_campaign || "",
  };
  const { error } = await db
    .from("prospects")
    .upsert(prospect, { onConflict: "ghl_contact_id" });
  if (error) throw error;
  const roster = await getCloserRoster();
  return {
    ...prospect,
    assigned_ghl_user_id: c.assignedTo || null,
    closer_id: roster.find(
      (row) => row.ghl_user_id && row.ghl_user_id === c.assignedTo,
    )?.id,
  };
}
