import { NextResponse, type NextRequest } from "next/server";
import { authClient, allowedEmail, sessionCookie } from "./lib/desk-auth";
export async function proxy(request: NextRequest) {
  if (process.env.PUBLIC_DEMO === "true") {
    if (
      request.nextUrl.pathname.startsWith("/api/") ||
      request.nextUrl.pathname.startsWith("/checkout/")
    )
      return new NextResponse(
        "Live services are unavailable in the public demo.",
        { status: 404 },
      );
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/webhooks/"))
    return NextResponse.next();
  if (process.env.DESK_AUTH_MODE === "supabase") {
    const path = request.nextUrl.pathname;
    if (
      path === "/login" ||
      path === "/auth/callback" ||
      ["/api/auth/signin", "/api/auth/session", "/api/auth/signout"].includes(path)
    )
      return NextResponse.next();
    const client = authClient();
    let token = request.cookies.get("desk_access")?.value;
    const refresh = request.cookies.get("desk_refresh")?.value;
    let user = token ? (await client.auth.getUser(token)).data.user : null;
    let renewed: import("@supabase/supabase-js").Session | null = null;
    if (!user && refresh) {
      const { data } = await client.auth.refreshSession({
        refresh_token: refresh,
      });
      renewed = data.session;
      token = renewed?.access_token;
      user = token ? (await client.auth.getUser(token)).data.user : null;
    }
    if (!user || !allowedEmail(user.email))
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
        : NextResponse.redirect(new URL("/login", request.url));
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.get("origin") &&
      request.headers.get("origin") !== request.nextUrl.origin
    )
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    if (renewed) {
      request.cookies.set("desk_access", renewed.access_token);
      request.cookies.set("desk_refresh", renewed.refresh_token);
    }
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    if (renewed) {
      response.cookies.set("desk_access", renewed.access_token, {
        ...sessionCookie,
        maxAge: renewed.expires_in,
      });
      response.cookies.set("desk_refresh", renewed.refresh_token, {
        ...sessionCookie,
        maxAge: 60 * 60 * 24 * 14,
      });
    }
    return response;
  }
  const password = process.env.DESK_PASSWORD;
  if (!password) {
    if (process.env.VERCEL)
      return new NextResponse(
        "Set DESK_PASSWORD before deploying this internal tool.",
        { status: 503 },
      );
    return NextResponse.next();
  }
  const auth = request.headers.get("authorization");
  const expected = btoa(`${process.env.DESK_USERNAME || "lewis"}:${password}`);
  if (auth !== `Basic ${expected}`)
    return new NextResponse("Sign in to Payment Desk", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Payment Desk"' },
    });
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
