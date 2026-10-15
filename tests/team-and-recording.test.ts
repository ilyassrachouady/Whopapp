import test from "node:test";
import assert from "node:assert/strict";

import { recordingUrlSchema, withRecording, recordingFromNotes } from "../lib/recording";
import { newContactSchema, closerSchema } from "../lib/team-validation";
import { createOrFindContact } from "../lib/ghl";
test("recording links allow HTTPS only and preserve call notes", () => {
  const base = {
    prospectId: "p",
    closerId: "c",
    attendance: "attended",
    outcome: "no_sale",
    loss_reason: "Price",
    notes: "Useful note",
  };
  // Validate via the shared recording schema without depending on outcome labels.
  const text = withRecording(base.notes, "https://fathom.video/share/test");
  assert.equal(recordingFromNotes(text), "https://fathom.video/share/test");
  assert.ok(text.startsWith("Useful note"));
  assert.equal(recordingUrlSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(recordingUrlSchema.safeParse("https://fathom.video/share/test").success, true);
});
test("contact input normalizes email and requires international phone format", () => {
  const input = newContactSchema.parse({
    name: " Test Person ",
    email: "TEST@example.com",
    phone: "+447700900123",
  });
  assert.equal(input.email, "test@example.com");
  assert.equal(input.name, "Test Person");
  assert.equal(
    newContactSchema.safeParse({ ...input, phone: "07700900123" }).success,
    false,
  );
  assert.equal(
    closerSchema.safeParse({ name: "Test Closer", email: "invalid" }).success,
    false,
  );
});
test("CRM create reuses an existing contact without overwriting it", async () => {
  const previous = {
    mode: process.env.GHL_MODE,
    writes: process.env.GHL_WRITES_ENABLED,
    key: process.env.GHL_API_KEY,
    location: process.env.GHL_LOCATION_ID,
  };
  const originalFetch = globalThis.fetch;
  process.env.GHL_MODE = "real";
  process.env.GHL_WRITES_ENABLED = "true";
  process.env.GHL_API_KEY = "test";
  process.env.GHL_LOCATION_ID = "location";
  const methods: string[] = [];
  globalThis.fetch = async (_url, init) => {
    methods.push(init?.method || "GET");
    return Response.json({
      contact: {
        id: "existing",
        locationId: "location",
        email: "test@example.com",
      },
    });
  };
  try {
    assert.deepEqual(
      await createOrFindContact({
        name: "Test",
        email: "test@example.com",
        phone: "",
      }),
      { contactId: "existing", existing: true },
    );
    assert.deepEqual(methods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      GHL_MODE: previous.mode,
      GHL_WRITES_ENABLED: previous.writes,
      GHL_API_KEY: previous.key,
      GHL_LOCATION_ID: previous.location,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
