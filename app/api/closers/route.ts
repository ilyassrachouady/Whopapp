import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Closer choices come from the approved GHL user roster. Use Other for someone outside GHL.",
    },
    { status: 405 },
  );
}
