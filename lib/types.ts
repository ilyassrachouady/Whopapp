export type PaymentType = "pif" | "two" | "three" | "custom";
export interface Prospect {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  ghl_contact_id: string;
  ghl_opportunity_id: string;
  lead_source: string;
  call_id: string;
  appointment_id?: string;
  trakyo_id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}
export interface Closer {
  id: string;
  name: string;
  email: string;
  initials: string;
}
export interface Offer {
  id: string;
  name: string;
  slug: string;
  price: number;
  badge: string;
  description: string;
}
export interface CustomPlan {
  dueToday: number;
  remainingPayments: number;
  futureAmount: number;
  firstDate: string;
}
export interface PaymentPlan {
  type: PaymentType;
  amountDueToday: number;
  remaining: number;
  paymentCount: number;
  installments: number[];
  firstDate?: string;
}
export interface CheckoutMetadata {
  ghl_contact_id: string;
  ghl_opportunity_id: string;
  closer_id: string;
  closer_name: string;
  offer_id: string;
  offer_name: string;
  contract_value: number;
  payment_type: PaymentType;
  call_id: string;
  trakyo_id: string;
  lead_source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}
export interface CheckoutSession {
  id: string;
  prospect_id: string;
  closer_id: string;
  offer_id: string;
  contract_value: number;
  payment_type: PaymentType;
  amount_due_today: number;
  payment_count: number;
  whop_checkout_id: string;
  checkout_url: string;
  call_id: string;
  trakyo_id: string;
  status: "created" | "paid" | "partially_paid";
  created_at: string;
  metadata: CheckoutMetadata;
  plan: PaymentPlan;
  mode: "mock" | "live";
}

export type CallOutcome =
  "sold" | "follow_up" | "no_sale" | "no_show" | "unqualified";
export interface CallDraft {
  followUpDate: string;
  followUpTime: string;
  followUpReason: string;
  nextStep: string;
  notes: string;
  lossReason: string;
  rescheduleNeeded: boolean;
}
interface CallInputBase {
  prospectId: string;
  closerId: string;
  notes: string;
}
interface FollowUpInput {
  follow_up_date: string;
  follow_up_time: string;
  follow_up_at: string;
  time_zone: string;
}
export type CompleteCallInput = CallInputBase &
  (
    | { call_outcome: "sold"; checkout_session_id: string }
    | ({
        call_outcome: "follow_up";
        follow_up_reason: string;
        next_step: string;
      } & Omit<FollowUpInput, "follow_up_at">)
    | { call_outcome: "no_sale" | "unqualified"; loss_reason: string }
    | ({
        call_outcome: "no_show";
        reschedule_needed: boolean;
      } & Partial<Omit<FollowUpInput, "follow_up_at">>)
  );
interface CallRecordBase {
  id: string;
  prospect_id: string;
  prospect_name: string;
  ghl_contact_id: string;
  ghl_opportunity_id: string;
  closer_id: string;
  closer_name: string;
  call_id: string;
  appointment_id: string;
  lead_source: string;
  trakyo_id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  notes: string;
  created_at: string;
  sync_status: "pending";
  mode: "mock";
}
export type CallRecord = CallRecordBase &
  (
    | {
        call_outcome: "sold";
        checkout_session_id: string;
        offer_id: string;
        offer_name: string;
        contract_value: number;
        payment_type: PaymentType;
        amount_due_today: number;
        checkout_url: string;
        whop_checkout_id: string;
      }
    | ({
        call_outcome: "follow_up";
        follow_up_reason: string;
        next_step: string;
      } & FollowUpInput)
    | { call_outcome: "no_sale" | "unqualified"; loss_reason: string }
    | ({
        call_outcome: "no_show";
        reschedule_needed: boolean;
      } & Partial<FollowUpInput>)
  );
