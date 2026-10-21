import { syncCallFields } from "@/lib/call-fields-sync";
import { syncCallAppointment } from "@/lib/call-appointment-sync";
import { syncCallNotes } from "@/lib/call-notes-sync";
import { NextResponse } from "next/server";
import { z } from "zod";
import { syncCallOwner } from "@/lib/call-owner-sync";
import { completeCall } from "@/lib/calls";
import { getSession } from "@/lib/supabase";
export async function POST(request: Request) {
  try {
    const result = await completeCall(await request.json());
    const appointmentSync = await syncCallAppointment(result.record);
    const assignment = await syncCallOwner(result.record);
    const notesSync = await syncCallNotes(result.record);
    const fieldsSync = await syncCallFields(result.record);
    const checkout =
      result.record.outcome === "sold" || result.record.outcome === "deposit"
        ? await getSession(result.record.checkout_session_id)
        : null;
    return NextResponse.json(
      {
        ...result,
        checkout,
        assignment,
        notesSync,
        fieldsSync,
        appointmentSync,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0]?.message || "Check the call details."
            : error instanceof Error
              ? error.message
              : "Could not complete this call.",
      },
      { status: 400 },
    );
  }
}
