import "server-only";
import type { Prospect, Offer, PaymentRecord } from "./types";
export async function provisionProductAccess({
  contact,
  offer,
  payment,
}: {
  contact: Prospect;
  offer: Offer;
  payment: PaymentRecord;
}) {
  // Pablo's API/invitation mechanism is not confirmed. Never claim access is granted.
  return {
    status: "pending_integration",
    provider: "pablo",
    contact_id: contact.ghl_contact_id,
    offer_id: offer.id,
    payment_id: payment.whop_payment_id,
  };
}
