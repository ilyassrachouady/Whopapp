import { NextResponse } from "next/server";
import { authClient, allowedEmail } from "@/lib/desk-auth";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const body = await request.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!allowedEmail(email))
    return NextResponse.json(
      { error: "This email does not have desk access." },
      { status: 403 },
    );
  const { error } = await authClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.APP_URL || new URL(request.url).origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  return NextResponse.json(
    error
      ? { error: "Could not send the sign-in link. Please try again shortly." }
      : { sent: true },
    { status: error ? 502 : 200 },
  );
}
