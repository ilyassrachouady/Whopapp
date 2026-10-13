import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
// Mock events only. Live Whop signature verification and event mapping are deliberately gated.
const event = z.object({
  id: z.string().min(1),
  type: z.literal("payment.succeeded"),
  checkout_session_id: z.string().uuid(),
  whop_payment_id: z.string().min(1),
  amount_collected: z.number().int().positive(),
});
export async function POST(request: Request) {
  if (process.env.WHOP_API_KEY)
    return NextResponse.json(
      { error: "Live webhook processing is not enabled." },
      { status: 503 },
    );
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-mock-webhook-secret") || "";
  if (!secret)
    return NextResponse.json(
      { error: "Configure a mock webhook secret." },
      { status: 503 },
    );
  if (
    supplied.length !== secret.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = event.parse(await request.json());
    const { processMockPayment } = await import("@/lib/webhooks");
    return NextResponse.json(await processMockPayment(parsed));
  } catch {
    return NextResponse.json(
      { error: "Invalid event or checkout session." },
      { status: 400 },
    );
  }
}
