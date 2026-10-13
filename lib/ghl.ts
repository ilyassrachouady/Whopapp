import "server-only";
import { prospects } from "./config";
export const ghlMode = () => (process.env.GHL_API_KEY ? "configured" : "mock");
export async function getContact(id: string) {
  if (!process.env.GHL_API_KEY)
    return (
      prospects.find((p) => p.id === id || p.ghl_contact_id === id) ?? null
    );
  const r = await fetch(
    `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: "2021-07-28",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!r.ok) throw new Error("Unable to retrieve GHL contact.");
  return (await r.json()).contact;
}
const pending = async () => {
  if (process.env.GHL_API_KEY)
    throw new Error("This GHL operation has not been enabled.");
  return { mode: "mock", sent: false };
};
export const getOpportunity = pending;
export const sendSMS = pending;
export const sendEmail = pending;
export const updateOpportunity = pending;
export const addPaymentInformation = pending;
