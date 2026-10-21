import "server-only";
import { attendanceLabels, outcomeLabels } from "./call-options";
import { getContact, ghlMode } from "./ghl";
import { recordingFromNotes } from "./recording";
import { getSupabase } from "./supabase";
import type { CallRecord } from "./types";

const FIELD_IDS = {
  paymentStructure:
    process.env.GHL_PAYMENT_STRUCTURE_FIELD_ID || "zEhU8JWInYrH6IqUCzDL",
  attendance:
    process.env.GHL_CALL_ATTENDANCE_FIELD_ID || "Rn3fLeiuPVb5aXuNdN8T",
  outcome: process.env.GHL_CALL_OUTCOME_FIELD_ID || "ggCOCEGWg4AuDLhEjrQ0",
  recording:
    process.env.GHL_CALL_RECORDING_FIELD_ID || "8qJI1gtlK6QF9n0rEcXD",
  callDate: process.env.GHL_CALL_DATE_FIELD_ID || "KYjQJRzXSOarJEh2kqxQ",
  closer: process.env.GHL_CALL_CLOSER_FIELD_ID || "PC1rXs1GzB31f31FcNfh",
  agreedTotalInvestment:
    process.env.GHL_AGREED_TOTAL_INVESTMENT_FIELD_ID || "4o5MFBZYoNM0XPjr0dxs",
  cash: process.env.GHL_CASH_COLLECTED_FIELD_ID || "DBBnV2FF6RxWT3OwwveE",
  firstPaymentDate:
    process.env.GHL_FIRST_PAYMENT_DATE_FIELD_ID || "ZKCL3fJBAIBwv8YCXxz2",
} as const;

type GhlFieldValue = {
  id: string;
  fieldValue: string | number;
};

// Call completion is not a new money event. Preserve positive CRM cash and
// existing dates; confirmed receipt processing has its own explicit write path.
export function protectExistingCallCash(fields: GhlFieldValue[], existing: unknown) {
  const rows = Array.isArray(existing) ? existing : [];
  return fields.filter((field) => {
    if (field.id === FIELD_IDS.firstPaymentDate && field.fieldValue === "") return false;
    if (field.id !== FIELD_IDS.cash) return true;
    const current = rows.find((row) => row && row.id === FIELD_IDS.cash);
    const raw = current?.value ?? current?.fieldValue;
    return !(raw !== undefined && raw !== null && String(raw).trim() !== "" && Number(raw) > 0);
  });
}

function writesEnabled() {
  if (process.env.GHL_WRITES_ENABLED !== "true")
    throw new Error("GHL writes are disabled.");
}

async function updateContactFields(
  contactId: string,
  customFields: GhlFieldValue[],
  preserveCallCash = false,
) {
  if (ghlMode() !== "real")
    return { status: "mock" as const, contactId, customFields };

  writesEnabled();
  const contact = await getContact(contactId);
  if (!contact || !("locationId" in contact))
    throw new Error("A live GHL contact is required.");

  if (preserveCallCash) customFields = protectExistingCallCash(customFields, contact.customFields);

  const response = await fetch(
    `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: process.env.GHL_API_VERSION || "v3",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customFields }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );

  if (!response.ok)
    throw new Error(
      `GHL custom-field update failed (${response.status}). Check token scopes and field IDs.`,
    );

  return {
    status: "synced" as const,
    contactId,
    fieldsUpdated: customFields.length,
  };
}

async function paymentSnapshotForCall(record: CallRecord) {
  if (record.outcome !== "sold" && record.outcome !== "deposit")
    return { cashCollected: 0, firstPaymentDate: "" };

  const initialSalePayment =
    record.outcome === "sold" && typeof record.amount_due_today === "number"
      ? record.amount_due_today
      : 0;

  if (!("checkout_session_id" in record) || !record.checkout_session_id)
    return {
      cashCollected: initialSalePayment,
      firstPaymentDate: "",
    };

  const db = getSupabase();
  if (!db)
    return {
      cashCollected: initialSalePayment,
      firstPaymentDate: "",
    };

  const { data, error } = await db
    .from("payments")
    .select("amount_collected,paid_at")
    .eq("checkout_session_id", record.checkout_session_id)
    .eq("payment_status", "succeeded");

  if (error) throw new Error("Could not read confirmed cash for this call.");

  const payments = data || [];
  const confirmedCash = payments.reduce(
    (sum, payment) => sum + Number(payment.amount_collected || 0),
    0,
  );
  const firstPaymentDate = payments
    .map((payment) => String(payment.paid_at || ""))
    .filter(Boolean)
    .sort()[0];

  return {
    // For a Sold call, Lewis wants the latest-call snapshot to show the
    // initial sale payment immediately, even before Whop confirms it. Once
    // payments arrive, the confirmed cumulative cash takes over.
    cashCollected:
      record.outcome === "sold" && confirmedCash === 0
        ? initialSalePayment
        : confirmedCash,
    firstPaymentDate: firstPaymentDate
      ? new Date(firstPaymentDate).toISOString().slice(0, 10)
      : "",
  };
}

export function callFieldValues(
  record: CallRecord,
  cashCollectedCents: number,
  firstPaymentDate = "",
) {
  const agreedTotalInvestmentCents =
    record.outcome === "sold" && typeof record.contract_value === "number"
      ? record.contract_value
      : 0;

  return [
    {
      id: FIELD_IDS.paymentStructure,
      // Agreed sale structure, independent of whether money has arrived.
      // Financing is not a separate selection in Payment Desk yet.
      fieldValue: record.outcome !== "sold" ? "" :
        record.payment_type === "pif" ? "Pay in Full (PIF)" :
        record.payment_type === "two" || record.payment_type === "three" || record.payment_type === "custom"
          ? "Manual Payment Plan" : "",
    },
    {
      id: FIELD_IDS.attendance,
      fieldValue: attendanceLabels[record.attendance],
    },
    {
      id: FIELD_IDS.outcome,
      fieldValue: record.outcome ? outcomeLabels[record.outcome] : "",
    },
    {
      id: FIELD_IDS.recording,
      fieldValue: recordingFromNotes(record.notes),
    },
    {
      id: FIELD_IDS.callDate,
      fieldValue: record.created_at.slice(0, 10),
    },
    {
      id: FIELD_IDS.closer,
      fieldValue: record.closer_name,
    },
    {
      id: FIELD_IDS.agreedTotalInvestment,
      fieldValue: agreedTotalInvestmentCents / 100,
    },
    {
      id: FIELD_IDS.cash,
      fieldValue: cashCollectedCents / 100,
    },
    {
      id: FIELD_IDS.firstPaymentDate,
      fieldValue: firstPaymentDate,
    },
  ].filter((field) => {
    // Attendance/follow-up changes must not erase an existing sale's finances.
    // Deposits may update cash only when there is a confirmed receipt.
    if (record.outcome !== "sold") {
      if (field.id === FIELD_IDS.paymentStructure || field.id === FIELD_IDS.agreedTotalInvestment)
        return false;
      if (field.id === FIELD_IDS.cash || field.id === FIELD_IDS.firstPaymentDate)
        return record.outcome === "deposit" && Boolean(firstPaymentDate);
    }
    return true;
  }) satisfies GhlFieldValue[];
}

export async function syncCallFields(record: CallRecord) {
  // GHL field sync is controlled by the CRM integration mode, not by whether
  // owner assignment changed the in-memory call record to `live`. This keeps
  // reporting fields working for "Other closer" and other no-assignment cases.
  if (ghlMode() !== "real") return { status: "mock" as const };

  try {
    const snapshot = await paymentSnapshotForCall(record);
    return await updateContactFields(
      record.ghl_contact_id,
      callFieldValues(
        record,
        snapshot.cashCollected,
        snapshot.firstPaymentDate,
      ),
      true,
    );
  } catch (error) {
    return {
      status: "failed" as const,
      message:
        error instanceof Error
          ? error.message
          : "Call fields could not be synced to GHL.",
    };
  }
}

export async function syncConfirmedCash(
  contactId: string,
  cashCollectedCents: number,
  options: {
    firstPaymentDate?: string;
    agreedTotalInvestmentCents?: number;
  } = {},
) {
  if (!Number.isSafeInteger(cashCollectedCents) || cashCollectedCents < 0)
    throw new Error("Invalid confirmed cash amount.");

  const fields: GhlFieldValue[] = [
    {
      id: FIELD_IDS.cash,
      fieldValue: cashCollectedCents / 100,
    },
  ];

  if (options.agreedTotalInvestmentCents !== undefined) {
    if (
      !Number.isSafeInteger(options.agreedTotalInvestmentCents) ||
      options.agreedTotalInvestmentCents < 0
    )
      throw new Error("Invalid agreed total investment amount.");
    fields.unshift({
      id: FIELD_IDS.agreedTotalInvestment,
      fieldValue: options.agreedTotalInvestmentCents / 100,
    });
  }

  if (options.firstPaymentDate) {
    const timestamp = Date.parse(options.firstPaymentDate);
    if (!Number.isFinite(timestamp)) throw new Error("Invalid first payment date.");
    fields.push({
      id: FIELD_IDS.firstPaymentDate,
      fieldValue: new Date(timestamp).toISOString().slice(0, 10),
    });
  }

  return updateContactFields(contactId, fields);
}
