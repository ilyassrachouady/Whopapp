import test from "node:test";
import assert from "node:assert/strict";
import { ensureContactCallNote } from "../lib/ghl";
import { callNoteBody } from "../lib/call-notes-sync";
import type { CallRecord } from "../lib/types";
test("GHL call notes are verified and normal retries reuse the report reference", async () => {
  const keys = [
    "GHL_MODE",
    "GHL_WRITES_ENABLED",
    "GHL_API_KEY",
    "GHL_LOCATION_ID",
  ];
  const saved = keys.map((key) => process.env[key]),
    original = globalThis.fetch;
  Object.assign(process.env, {
    GHL_MODE: "real",
    GHL_WRITES_ENABLED: "true",
    GHL_API_KEY: "test",
    GHL_LOCATION_ID: "location",
  });
  let note: { id: string; body: string } | undefined,
    writes = 0;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (options?.method === "POST") {
      writes++;
      note = { id: "note1", body: JSON.parse(String(options.body)).body };
      return Response.json({ note });
    }
    if (path.endsWith("/notes"))
      return Response.json({ notes: note ? [note] : [] });
    if (path.endsWith("/notes/note1")) return Response.json({ note });
    return Response.json({
      contact: { id: "contact", locationId: "location" },
    });
  };
  try {
    const record = {
      id: "report123",
      attendance: "attended",
      outcome: "no_sale",
      closer_name: "Guest Closer",
      notes: "Useful notes\nCall recording: https://example.com/test",
      created_at: "2026-10-15T12:00:00Z",
      loss_reason: "Other",
    } as CallRecord;
    const body = callNoteBody(record),
      marker = "Payment Desk report reference: report123";
    assert.ok(body.includes("Guest Closer"));
    assert.ok(body.includes("https://example.com/test"));
    assert.equal(
      (await ensureContactCallNote("contact", marker, body)).status,
      "synced",
    );
    assert.equal(
      (await ensureContactCallNote("contact", marker, body)).duplicate,
      true,
    );
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
});
