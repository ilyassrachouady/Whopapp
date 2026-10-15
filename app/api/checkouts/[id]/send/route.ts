import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/supabase";
import { sendEmail, sendSMS } from "@/lib/ghl";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { channel } = z
      .object({ channel: z.enum(["sms", "email"]) })
      .parse(await request.json());
    const session = await getSession(id);
    if (!session)
      return NextResponse.json(
        { error: "Checkout not found." },
        { status: 404 },
      );
    if (session.mode === "mock")
      throw new Error(
        "Generate a Whop sandbox or live checkout before sending it.",
      );
    const allowed = z
      .array(z.string())
      .parse(JSON.parse(process.env.GHL_TEST_CONTACT_IDS_JSON || "[]"));
    if (
      session.mode === "sandbox" &&
      !allowed.includes(session.metadata.ghl_contact_id)
    )
      throw new Error(
        "Sandbox links can only be sent to your configured test contacts.",
      );
    const url = new URL(session.checkout_url);
    if (url.protocol !== "https:")
      throw new Error("Only secure Whop links can be sent.");
    const text = `Here is your checkout link for ${session.metadata.offer_name}: ${session.checkout_url}`;
    const receipt =
      channel === "sms"
        ? await sendSMS(session.metadata.ghl_contact_id, text)
        : await sendEmail(
            session.metadata.ghl_contact_id,
            "Your checkout link",
            `<p>Your checkout link is ready:</p><p><a href="${url.href.replaceAll('"', "&quot;")}">Open checkout</a></p>`,
          );
    return NextResponse.json({ queued: true, channel, ...receipt });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send the checkout link.",
      },
      { status: 400 },
    );
  }
}
