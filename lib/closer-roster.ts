import "server-only";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { OTHER_CLOSER_ID } from "./closer-selection";
import type { Closer } from "./types";
// Explicit closer designation, separate from GHL security roles/permissions.
export function approvedCloserIds() {
  if (process.env.GHL_CLOSER_USER_IDS !== undefined)
    return process.env.GHL_CLOSER_USER_IDS.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  return process.env.GHL_LOCATION_ID === "WgeDf11I8yBah6LRzZL1"
    ? ["EnYRCrKE1ZwWz9B6T6EY"]
    : [];
}
export async function getCloserRoster(): Promise<Closer[]> {
  const db = getSupabase();
  if (!db) throw new Error("Database required for the closer roster.");
  const allowed = approvedCloserIds();
  const response = await fetch(
    `https://services.leadconnectorhq.com/users/?${new URLSearchParams({ locationId: process.env.GHL_LOCATION_ID || "" })}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: process.env.GHL_API_VERSION || "v3",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Could not load GHL users. Check users.readonly permission.",
    );
  const data = await response.json();
  const users = z
    .array(
      z.object({
        id: z.string(),
        name: z.string().nullish(),
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        email: z.string(),
      }),
    )
    .parse(data.users);
  const selected = users.filter((user) => allowed.includes(user.id));
  // Preserve existing closer IDs so historical checkout/report foreign keys stay valid.
  const { data: previous, error: readError } = await db
    .from("closers")
    .select("id,ghl_user_id");
  if (readError) throw readError;
  const rows: {
    id: string;
    ghl_user_id: string | null;
    name: string;
    email: string;
  }[] = selected.map((user) => ({
    id:
      previous?.find((row) => row.ghl_user_id === user.id)?.id ||
      `ghl_${user.id}`,
    ghl_user_id: user.id,
    name:
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email,
    email: user.email,
  }));
  rows.push({
    id: OTHER_CLOSER_ID,
    ghl_user_id: null,
    name: "Other",
    email: "",
  });
  const { error } = await db.from("closers").upsert(rows, { onConflict: "id" });
  if (error) throw new Error("Could not sync closer roster.");
  return rows.map((row) => ({
    ...row,
    initials: row.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2),
  }));
}
