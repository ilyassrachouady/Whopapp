import "server-only";
import { sendEmail, triggerPaymentWorkflow } from "./ghl";
import type { Prospect, Offer } from "./types";
export async function sendWelcomeEmail({
  contact,
  offer,
  live = false,
}: {
  contact: Prospect;
  offer: Offer;
  live?: boolean;
}) {
  if (!live || process.env.PAYMENT_AUTOMATION_MODE !== "real")
    return {
      status: "mock",
      owner: "ghl",
      contact_id: contact.ghl_contact_id,
      offer_id: offer.id,
    };
  if (process.env.WELCOME_EMAIL_MODE === "direct") {
    const subject = process.env.WELCOME_EMAIL_SUBJECT,
      html = process.env.WELCOME_EMAIL_HTML;
    if (!subject || !html)
      throw new Error("Configure approved welcome email copy.");
    const result = await sendEmail(contact.ghl_contact_id, subject, html);
    return { status: "sent", ...result };
  }
  // In workflow-owned mode this is the single handoff for Slack, email and access.
  const result = await triggerPaymentWorkflow(contact.ghl_contact_id);
  return { status: "delegated_to_ghl", ...result };
}
