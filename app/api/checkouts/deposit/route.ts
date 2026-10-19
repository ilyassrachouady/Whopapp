import { resolveCloser } from "@/lib/closer-selection";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import {
  depositCheckoutSchema,
  createDemoDepositCheckout,
} from "@/lib/deposits";
import { createDepositCheckout } from "@/lib/whop";
import { saveSession, getSession } from "@/lib/supabase";
export async function POST(request: Request) {
  try {
    const input = depositCheckoutSchema.parse(await request.json());
    const catalog = await getCatalog();
    const prospect = catalog.prospects.find((p) => p.id === input.prospectId),
      closer = resolveCloser(
        catalog.closers,
        input.closerId,
        input.other_closer_name,
      );
    if (!prospect || !closer)
      throw new Error("Select a valid prospect and closer.");
    const session = createDemoDepositCheckout({
      prospect,
      closer,
      amount: input.depositAmount,
      schedule: input,
      origin: new URL(request.url).origin,
      id: input.requestId,
    });
    const existing = await getSession(session.id);
    if (existing) {
      if (
        existing.checkout_type !== "deposit" ||
        existing.prospect_id !== prospect.id ||
        existing.closer_id !== closer.id ||
        existing.metadata.closer_name !== closer.name ||
        existing.deposit_amount !== input.depositAmount ||
        existing.follow_up_at !== session.follow_up_at
      )
        throw new Error(
          "Checkout request does not match its original context.",
        );
      return NextResponse.json(existing);
    }
    const checkout = await createDepositCheckout({
      id: session.id,
      amount: session.deposit_amount,
      metadata: session.metadata,
    });
    session.whop_checkout_id = checkout.id;
    session.checkout_url = checkout.url;
    session.mode = checkout.mode;
    await saveSession(session);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create deposit link.",
      },
      { status: 400 },
    );
  }
}
