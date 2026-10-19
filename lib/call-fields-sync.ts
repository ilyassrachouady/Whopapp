import "server-only";
import { attendanceLabels, outcomeLabels } from "./call-options";
import { getContact, ghlMode } from "./ghl";
import { recordingFromNotes } from "./recording";
import { getSupabase } from "./supabase";
import type { CallRecord } from "./types";

const FIELD_IDS = {
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

function writesEnabled() {
  if (process.env.GHL_WRITES_ENABLED !== "true")
    throw new Error("GHL writes are disabled.");
}

async function updateContactFields(
  contactId: string,
  customFields: GhlFieldValue[],
) {
  if (ghlMode() !== "real")
    return { status: "mock" as const, contactId, customFields };

  writesEnabled();
  const contact = await getContact(contactId);
  if (!contact || !("locationId" in contact))
    throw new Error("A live GHL contact is required.");

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

async function confirmedCashForCall(record: CallRecord) {
  if (record.outcome !== "sold" && record.outcome !== "deposit") return 0;

  if (!("checkout_session_id" in record) || !record.checkout_session_id) return 0;

  const db = getSupabase();
  if (!db) return 0;

  const { data, error } = await db
    .from("payments")
    .select("amount_collected")
    .eq("checkout_session_id", record.checkout_session_id)
    .eq("payment_status", "succeeded");

  if (error) throw new Error("Could not read confirmed cash for this call.");

  return (data || []).reduce(
    (sum, payment) => sum + Number(payment.amount_collected || 0),
    0,
  );
}

export function callFieldValues(record: CallRecord, cashCollectedCents: number) {
  const agreedTotalInvestmentCents =
    record.outcome === "sold" && typeof record.contract_value === "number"
      ? record.contract_value
      : 0;

  return [
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
  ] satisfies GhlFieldValue[];
}

export async function syncCallFields(record: CallRecord) {
  if (record.mode !== "live") return { status: "mock" as const };

  try {
    const cashCollected = await confirmedCashForCall(record);
    return await updateContactFields(
      record.ghl_contact_id,
      callFieldValues(record, cashCollected),
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
