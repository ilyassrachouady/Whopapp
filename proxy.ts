import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/webhooks/"))
    return NextResponse.next();
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
