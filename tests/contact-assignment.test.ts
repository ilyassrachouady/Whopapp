import test from "node:test";
import assert from "node:assert/strict";
import { assignContactOwner } from "../lib/ghl";
import { syncCallOwner } from "../lib/call-owner-sync";
import type { CallRecord } from "../lib/types";
test("contact ownership is written and independently verified; Other never writes", async () => {
  const keys = [
    "GHL_MODE",
    "GHL_WRITES_ENABLED",
    "GHL_API_KEY",
    "GHL_LOCATION_ID",
  ];
  const saved = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    GHL_MODE: "real",
    GHL_WRITES_ENABLED: "true",
    GHL_API_KEY: "test",
    GHL_LOCATION_ID: "location",
  });
  let owner = "previous",
    writes = 0,
    reads = 0;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "PUT") {
      writes++;
      owner = JSON.parse(String(options.body)).assignedTo;
    } else reads++;
    return Response.json({
      contact: { id: "test", locationId: "location", assignedTo: owner },
    });
  };
  try {
    assert.equal(
      (await assignContactOwner("test", "brooklyn")).status,
      "synced",
    );
    assert.equal(owner, "brooklyn");
    assert.equal(writes, 1);
    assert.equal(reads, 2);
    await assignContactOwner("test", "brooklyn");
    assert.equal(writes, 1);
    assert.deepEqual(
      await syncCallOwner({ closer_id: "desk-other" } as CallRecord),
      { status: "unchanged" },
    );
    assert.equal(writes, 1);
    globalThis.fetch = async () =>
      Response.json({
        contact: {
          id: "test",
          locationId: "location",
          assignedTo: "unchanged",
        },
      });
    await assert.rejects(
      assignContactOwner("test", "brooklyn"),
      /could not be verified/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
});
