import { NextResponse } from "next/server";
import { searchContacts } from "@/lib/ghl";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2 || query.length > 100)
    return NextResponse.json(
      { error: "Enter 2–100 characters." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      { contacts: await searchContacts(query) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "CRM search is unavailable. Please try again." },
      { status: 502 },
    );
  }
}
