import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie } from "@/lib/desk-auth";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const token = request.cookies.get("desk_access")?.value;
  if (token)
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => null);
  const r = NextResponse.json({ signedOut: true });
  for (const name of ["desk_access", "desk_refresh"])
    r.cookies.set(name, "", { ...sessionCookie, maxAge: 0 });
  return r;
}
