// Synthetic demo fixtures only: example.com email addresses, fictional 555 phone numbers, and invented CRM IDs.
import type { Prospect, Closer, Offer } from "./types";
export const offers: Offer[] = [
  {
    id: "coaching",
    name: "Coaching Program",
    slug: "coaching-program",
    price: 199700,
    paymentOptions: {
      pif: {
        total: 199700,
        installments: 1,
        installmentAmount: 199700,
        whopPlanId: null,
        whopCheckoutId: null,
      },
      two: {
        total: 240000,
        installments: 2,
        installmentAmount: 120000,
        whopPlanId: null,
        whopCheckoutId: null,
      },
      three: {
        total: 240000,
        installments: 3,
        installmentAmount: 80000,
        whopPlanId: null,
        whopCheckoutId: null,
      },
    },
    badge: "CORE OFFER",
    description: "Your complete coaching program.",
  },
  {
    id: "sofia",
    name: "Sofia 1:1",
    slug: "sofia-1-on-1",
    price: 349700,
    whopProductId: "prod_SMkECC3LYeqYE",
    enableCardCheckout: true,
    badge: "PREMIUM",
    description: "Private coaching with Sofia.",
  },
];
export const closers: Closer[] = [
  {
    id: "lewis",
    name: "Lewis Kirby",
    email: "lewis@example.com",
    initials: "LK",
  },
  { id: "sofia", name: "Sofia", email: "sofia@example.com", initials: "S" },
  {
    id: "other",
    name: "Other closer",
    email: "sales@example.com",
    initials: "OC",
  },
];
export const prospects: Prospect[] = [
  {
    id: "john",
    closer_id: "lewis",
    full_name: "John Smith",
    email: "john@example.com",
    phone: "+1 555 123 4567",
    ghl_contact_id: "ghl_contact_john",
    ghl_opportunity_id: "ghl_opp_1042",
    lead_source: "Instagram",
    call_id: "call_1042",
    appointment_id: "appt_1042",
    trakyo_id: "trk_js_8391",
    utm_source: "instagram",
    utm_medium: "paid_social",
    utm_campaign: "coaching_october",
  },
  {
    id: "emma",
    closer_id: "sofia",
    full_name: "Emma Wilson",
    email: "emma@example.com",
    phone: "+1 555 234 5678",
    ghl_contact_id: "ghl_contact_emma",
    ghl_opportunity_id: "ghl_opp_1043",
    lead_source: "Referral",
    call_id: "call_1043",
    appointment_id: "appt_1043",
    trakyo_id: "trk_ew_8392",
    utm_source: "referral",
    utm_medium: "organic",
    utm_campaign: "client_referral",
  },
  {
    id: "alex",
    closer_id: "lewis",
    full_name: "Alex Morgan",
    email: "alex@example.com",
    phone: "+1 555 345 6789",
    ghl_contact_id: "ghl_contact_alex",
    ghl_opportunity_id: "ghl_opp_1044",
    lead_source: "YouTube",
    call_id: "call_1044",
    appointment_id: "appt_1044",
    trakyo_id: "trk_am_8393",
    utm_source: "youtube",
    utm_medium: "organic",
    utm_campaign: "coaching_october",
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const paymentLabels = {
  pif: "Pay in Full",
  two: "2 Payments",
  three: "3 Payments",
  custom: "Custom payment plan",
};
