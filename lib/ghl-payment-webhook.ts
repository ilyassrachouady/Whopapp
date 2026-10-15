import "server-only";
import type { SalesNotification } from "./slack";

export async function sendGHLPaymentWebhook(payment: SalesNotification, sessionId: string, key: string) {
  if (process.env.PAYMENT_AUTOMATION_MODE !== "real" || process.env.GHL_WRITES_ENABLED !== "true")
    throw new Error("GHL payment handoff is disabled.");
  const url = new URL(process.env.GHL_PAYMENT_WEBHOOK_URL || "");
  const prefix = `/hooks/${process.env.GHL_LOCATION_ID}/webhook-trigger/`;
  if (url.origin !== "https://services.leadconnectorhq.com" || !url.pathname.startsWith(prefix))
    throw new Error("Unexpected GHL webhook destination.");
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      email: payment.email, ghl_contact_id: payment.ghl_contact_id,
      payment_status: "paid", checkout_type: "sale", offer_name: payment.offer,
      closer_name: payment.closer, amount_paid: (payment.amount_collected / 100).toFixed(2),
      currency: "USD", payment_type: payment.payment_type,
      whop_payment_id: payment.whop_payment_id, checkout_session_id: sessionId,
    }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GHL payment webhook failed (${response.status}).`);
  return { status: "delegated_to_ghl", contactId: payment.ghl_contact_id, httpStatus: response.status };
}
