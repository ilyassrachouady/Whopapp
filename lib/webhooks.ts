import "server-only";
import { getSession } from "./supabase";
import { handleWhopPaymentSuccess } from "./payment-success";
export async function processMockPayment(event: {
  id: string;
  checkout_session_id: string;
  whop_payment_id: string;
  amount_collected: number;
  paid_at?: string;
}) {
  const session = await getSession(event.checkout_session_id);
  if (!session || session.mode !== "mock")
    throw new Error("Mock events only apply to mock checkouts.");
  return handleWhopPaymentSuccess(
    { ...event, paid_at: event.paid_at || new Date().toISOString() },
    { session },
  );
}
