import "server-only";
import { createHash } from "node:crypto";
import { money } from "./config";
export interface SalesNotification {
  prospect_name: string;
  email: string;
  phone: string;
  closer: string;
  amount_collected: number;
  contract_value: number | null;
  offer: string;
  payment_type: string;
  follow_up_at?: string;
  time_zone?: string;
  whop_payment_id: string;
  ghl_contact_id: string;
  ghl_opportunity_id: string;
}
async function notify(
  kind: "deposit" | "new_client",
  payload: SalesNotification,
  idempotencyKey: string,
  live = false,
) {
  const channel = kind === "deposit" ? "#sales-deposits" : "#sales-new-clients";
  if (!live || process.env.SLACK_MODE !== "real") {
    console.info(
      JSON.stringify({ service: "slack", mode: "mock", channel, payload }),
    );
    return { status: "mock", channel, payload };
  }
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId =
    kind === "deposit"
      ? process.env.SLACK_DEPOSITS_CHANNEL_ID
      : process.env.SLACK_NEW_CLIENTS_CHANNEL_ID;
  if (!token || !channelId)
    throw new Error("Configure Slack bot and target channel IDs.");
  const followUp = payload.follow_up_at
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: payload.time_zone || "UTC",
      }).format(new Date(payload.follow_up_at))
    : undefined;
  const text = [
    kind === "deposit" ? "DEPOSIT RECEIVED" : "NEW CLIENT",
    payload.prospect_name,
    payload.offer,
    `${money(payload.amount_collected)} received${payload.contract_value ? ` · ${money(payload.contract_value)} contract` : " deposit"}`,
    `Closer: ${payload.closer}`,
    followUp ? `Follow-up: ${followUp} (${payload.time_zone})` : "",
    payload.email,
    payload.phone,
    `GHL contact: ${payload.ghl_contact_id}`,
    `GHL opportunity: ${payload.ghl_opportunity_id}`,
    `Whop payment: ${payload.whop_payment_id}`,
  ]
    .filter(Boolean)
    .join("\n");
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      client_msg_id: (() => {
        const h = createHash("sha256").update(idempotencyKey).digest("hex");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
      })(),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new Error("Slack notification failed; retry payment processing.");
  return { status: "sent", channel, ts: data.ts };
}
export const notifyNewClient = (
  payload: SalesNotification,
  key: string,
  live = false,
) => notify("new_client", payload, key, live);
export const notifyDeposit = (
  payload: SalesNotification,
  key: string,
  live = false,
) => notify("deposit", payload, key, live);
export const notifySalesDeposit = notifyDeposit;
