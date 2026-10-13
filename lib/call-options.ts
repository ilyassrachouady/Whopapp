import type { CallDraft, CallOutcome } from "./types";
export const outcomeLabels: Record<CallOutcome, string> = {
  sold: "Sold",
  follow_up: "Follow-up",
  no_sale: "No Sale",
  no_show: "No Show",
  unqualified: "Unqualified",
};
export const followUpReasons = [
  "Needs time to think",
  "Speak with partner",
  "Waiting on funds",
  "Follow up after another event",
  "Requested callback",
  "Other",
] as const;
export const noSaleReasons = [
  "Price",
  "Not interested",
  "Not the right time",
  "Chose competitor",
  "Not enough trust",
  "Offer not a fit",
  "Financing/payment issue",
  "Other",
] as const;
export const unqualifiedReasons = [
  "Budget",
  "Wrong fit",
  "Not decision maker",
  "Not ready",
  "Invalid lead",
  "Other",
] as const;
export const emptyCallDraft = (): CallDraft => ({
  followUpDate: "",
  followUpTime: "",
  followUpReason: "",
  nextStep: "",
  notes: "",
  lossReason: "",
  rescheduleNeeded: true,
});
export function schedulePayload(draft: CallDraft) {
  return {
    follow_up_date: draft.followUpDate,
    follow_up_time: draft.followUpTime,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
