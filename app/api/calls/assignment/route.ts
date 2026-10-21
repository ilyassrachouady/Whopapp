import { syncCallFields } from "@/lib/call-fields-sync";
import { syncCallAppointment } from "@/lib/call-appointment-sync";
import { syncCallNotes } from "@/lib/call-notes-sync";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { syncCallOwner } from "@/lib/call-owner-sync";
export async function POST(request: Request) {
  try {
    const { recordId } = z
      .object({ recordId: z.uuid() })
      .parse(await request.json());
    const db = getSupabase();
    if (!db) throw new Error("Database unavailable.");
    const { data: record, error } = await db
      .from("call_records")
      .select("*")
      .eq("id", recordId)
      .single();
    if (error || !record) throw new Error("Call not found.");
    const appointmentSync = await syncCallAppointment(record);
    const assignment = await syncCallOwner(record);
    const notesSync = await syncCallNotes(record);
    const fieldsSync = await syncCallFields(record);
    return NextResponse.json({
      record,
      assignment,
      notesSync,
      fieldsSync,
      appointmentSync,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not retry GHL sync." },
      { status: 400 },
    );
  }
}
