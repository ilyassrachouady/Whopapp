import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
export function authClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Authentication is not configured.");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function allowedEmail(email?: string) {
  if (!email || !z.email().safeParse(email).success) return false;
  const allowed = (process.env.DESK_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return (
    allowed.includes("*") || allowed.includes(email.toLowerCase())
  );
}
export const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
