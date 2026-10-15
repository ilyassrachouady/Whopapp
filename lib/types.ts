export type PaymentType = "pif" | "two" | "three" | "custom";
export interface Prospect {
  assigned_ghl_user_id?: string | null;
  closer_id?: string;
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
  ghl_user_id?: string | null;
}
export interface OfferPaymentOption {
  total: number;
  installments: number;
  installmentAmount: number;
  whopPlanId: string | null;
  whopCheckoutId: string | null;
}
export interface Offer {
  whopProductId?: string;
  enableCardCheckout?: boolean;
  id: string;
  name: string;
  slug: string;
  price: number;
  paymentOptions?: Record<"pif" | "two" | "three", OfferPaymentOption>;
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
  contractValue: number;
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
  checkout_type?: "sale" | "deposit";
  prospect_name?: string;
  email?: string;
  phone?: string;
  offer_id: string | null;
  offer_name: string;
  contract_value: number | null;
  payment_type: PaymentType | null;
  deposit_amount?: number;
  follow_up_at?: string;
  call_id: string;
  trakyo_id: string;
  lead_source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}
interface CheckoutSessionBase {
  id: string;
  prospect_id: string;
  closer_id: string;
  amount_due_today: number;
  payment_count: number;
  installment_count: number;
  whop_checkout_id: string;
  checkout_url: string;
  call_id: string;
  trakyo_id: string;
  status: "created" | "pending_payment" | "paid" | "partially_paid" | "failed";
  created_at: string;
  metadata: CheckoutMetadata;
  mode: "mock" | "sandbox" | "live";
}
export interface SaleCheckoutSession extends CheckoutSessionBase {
  checkout_type: "sale";
  offer_id: string;
  contract_value: number;
  payment_type: PaymentType;
  plan: PaymentPlan;
  deposit_amount?: never;
  follow_up_at?: never;
}
export interface DepositCheckoutSession extends CheckoutSessionBase {
  checkout_type: "deposit";
  offer_id: null;
  contract_value: null;
  payment_type: null;
  plan: null;
  deposit_amount: number;
  follow_up_at: string;
  follow_up_date: string;
  follow_up_time: string;
  time_zone: string;
}
export type CheckoutSession = SaleCheckoutSession | DepositCheckoutSession;
export interface PaymentRecord {
  id: string;
  checkout_session_id: string;
  whop_payment_id: string;
  payment_type: PaymentType | null;
  amount_collected: number;
  contract_value: number | null;
  is_pif: boolean;
  is_deposit: boolean;
  status: "succeeded";
  paid_at: string;
  created_at: string;
}

export type Attendance = "attended" | "no_show" | "cancelled" | "rescheduled";
export type CallOutcome =
  "sold" | "deposit" | "follow_up" | "no_sale" | "unqualified";
export interface CallDraft {
  depositAmount: string;
  followUpDate: string;
  followUpTime: string;
  followUpReason: string;
  nextStep: string;
  notes: string;
  lossReason: string;
  followUpRequired: boolean;
  cancellationReason: string;
}
interface CallInputBase {
  other_closer_name?: string;
  recording_url?: string;
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
type ScheduleInput = Omit<FollowUpInput, "follow_up_at">;
type CallDetails =
  | { attendance: "attended"; outcome: "sold"; checkout_session_id: string }
  | ({
      attendance: "attended";
      outcome: "deposit";
      checkout_session_id: string;
    } & ScheduleInput)
  | ({
      attendance: "attended";
      outcome: "follow_up";
      follow_up_reason: string;
      next_step: string;
    } & ScheduleInput)
  | {
      attendance: "attended";
      outcome: "no_sale" | "unqualified";
      loss_reason: string;
    }
  | ({
      attendance: "no_show" | "cancelled";
      outcome: null;
      follow_up_required: boolean;
      cancellation_reason?: string;
    } & Partial<ScheduleInput>)
  | ({ attendance: "rescheduled"; outcome: null } & ScheduleInput);
export type CompleteCallInput = CallInputBase & CallDetails;
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
  sync_status: "pending" | "synced" | "failed";
  mode: "mock" | "live";
}
export type CallRecord = CallRecordBase &
  CallDetails &
  Partial<FollowUpInput> & {
    offer_id?: string;
    offer_name?: string;
    contract_value?: number;
    payment_type?: PaymentType;
    deposit_amount?: number;
    amount_due_today?: number;
    checkout_url?: string;
    whop_checkout_id?: string;
  };
