import "server-only";
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { CheckoutSession } from "./types";
export function getSupabase() {
  // Explicit local end-to-end test uses durable files, never the production database.
  if (process.env.PAYMENT_DESK_LOCAL_TEST === "true" && !process.env.VERCEL)
    return null;
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (Boolean(url) !== Boolean(key))
    throw new Error("Both Supabase credentials are required.");
  return url && key
    ? createClient(url, key, {
        auth: { persistSession: false },
        db: { schema: process.env.SUPABASE_SCHEMA || "public" },
      })
    : null;
}
const directory = path.join(process.cwd(), ".data");
export async function saveSession(session: CheckoutSession) {
  const db = getSupabase();
  if (db) {
    const { error } = await db.from("checkout_sessions").upsert({ ...session } as Record<string, unknown>);
    if (error) throw new Error("Could not save checkout session.");
  } else {
    if (process.env.VERCEL)
      throw new Error("Configure Supabase for persistent storage on Vercel.");
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, `${session.id}.json`);
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(session));
    await rename(temp, target);
  }
}
export async function getSession(id: string): Promise<CheckoutSession | null> {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
  const db = getSupabase();
  if (db) {
    const { data, error } = await db
      .from("checkout_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Could not load checkout.");
    return data;
  }
  try {
    return JSON.parse(
      await readFile(path.join(directory, `${id}.json`), "utf8"),
    );
  } catch {
    return null;
  }
}
