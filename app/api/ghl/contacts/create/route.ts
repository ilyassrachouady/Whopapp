import { NextResponse } from "next/server";
import { z } from "zod";
import { newContactSchema } from "@/lib/team-validation";
import { createOrFindContact } from "@/lib/ghl";
import { selectContact } from "@/lib/select-contact";
export async function POST(request: Request) {
  try {
    const input = newContactSchema.parse(await request.json());
    const result = await createOrFindContact(input);
    const prospect = await selectContact(result.contactId);
    return NextResponse.json(
      { prospect, existing: result.existing },
      { status: result.existing ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0].message
            : "Could not create/select contact. Search CRM before retrying; check GHL contact permissions if this continues.",
      },
      { status: 400 },
    );
  }
}
