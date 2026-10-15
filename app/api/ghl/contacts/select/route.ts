import { NextResponse } from "next/server";
import { selectContact } from "@/lib/select-contact";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      typeof body.contactId !== "string" ||
      !/^[a-zA-Z0-9]{20,24}$/.test(body.contactId)
    )
      return NextResponse.json(
        { error: "Select a valid contact." },
        { status: 400 },
      );
    const prospect = await selectContact(body.contactId);
    return NextResponse.json(
      { prospect },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not select this CRM contact. Please try again." },
      { status: 502 },
    );
  }
}
