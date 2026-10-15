import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { processWhopEvent } from "@/lib/whop-events";
// Whop signature verification precedes all real payment processing.
const event = z.object({
  id: z.string().min(1),
  type: z.literal("payment.succeeded"),
  checkout_session_id: z.string().uuid(),
  whop_payment_id: z.string().min(1),
  amount_collected: z.number().int().positive(),
});
export async function POST(request: Request) {
  if (process.env.WHOP_MODE === "real") {
    if (!process.env.WHOP_WEBHOOK_SECRET)
      return NextResponse.json(
        { error: "Webhook verification is not configured." },
        { status: 503 },
      );
    let verified: unknown;
    try {
      verified = unwrapWebhook(await request.text(), {
        headers: Object.fromEntries(request.headers),
        key: process.env.WHOP_WEBHOOK_SECRET,
      });
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook signature." },
        { status: 401 },
      );
    }
    try {
      return NextResponse.json(await processWhopEvent(verified));
    } catch {
      return NextResponse.json(
        { error: "Webhook processing failed; retry delivery." },
        { status: 503 },
      );
    }
  }
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-mock-webhook-secret") || "";
  if (!secret)
    return NextResponse.json(
      { error: "Configure a mock webhook secret." },
      { status: 503 },
    );
  if (
    Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = event.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid mock payment event." },
      { status: 400 },
    );
  try {
    const { processMockPayment } = await import("@/lib/webhooks");
    return NextResponse.json(await processMockPayment(parsed.data));
  } catch {
    return NextResponse.json(
      { error: "Mock payment processing failed; retry delivery." },
      { status: 503 },
    );
  }
}
