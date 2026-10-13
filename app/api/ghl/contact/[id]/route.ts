import { getContact } from "@/lib/ghl";
import { NextResponse } from "next/server";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contact = await getContact(id);
    return NextResponse.json(
      { contact, mode: process.env.GHL_API_KEY ? "live" : "mock" },
      { status: contact ? 200 : 404 },
    );
  } catch {
    return NextResponse.json(
      { error: "Contact lookup failed." },
      { status: 502 },
    );
  }
}
