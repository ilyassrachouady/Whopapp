import { NextResponse } from "next/server";
import { authClient, allowedEmail, sessionCookie } from "@/lib/desk-auth";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const body = await request.json().catch(() => ({}));
  if (
    typeof body.access_token !== "string" ||
    typeof body.refresh_token !== "string"
  )
    return NextResponse.json(
      { error: "Invalid sign-in link." },
      { status: 400 },
    );
  const client = authClient();
  const { data, error } = await client.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  const verified = data.session
    ? await client.auth.getUser(data.session.access_token)
    : null;
  if (
    error ||
    !data.session ||
    !verified?.data.user ||
    !allowedEmail(verified.data.user.email)
  )
    return NextResponse.json(
      { error: "Sign-in link expired or access denied." },
      { status: 401 },
    );
  const response = NextResponse.json({ authenticated: true });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("desk_access", data.session.access_token, {
    ...sessionCookie,
    maxAge: data.session.expires_in,
  });
  response.cookies.set("desk_refresh", data.session.refresh_token, {
    ...sessionCookie,
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
