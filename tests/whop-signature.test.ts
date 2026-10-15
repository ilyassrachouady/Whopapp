import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { unwrapWebhook } from "@whop/sdk/helpers";
test("Whop SDK verifies raw signed payloads and rejects tampering", () => {
  const secret = "ws_payment_desk_test_secret";
  const timestamp = new Date();
  const raw = JSON.stringify({
    type: "payment.succeeded",
    data: { id: "pay_test" },
  });
  const headers = {
    "webhook-id": "evt_test",
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": `v1,${createHmac("sha256", secret)
      .update(`evt_test.${Math.floor(timestamp.getTime() / 1000)}.${raw}`)
      .digest("base64")}`,
  };
  assert.equal(
    unwrapWebhook<{ type: string }>(raw, { headers, key: secret }).type,
    "payment.succeeded",
  );
  assert.throws(() => unwrapWebhook(raw + " ", { headers, key: secret }));
  assert.throws(() => unwrapWebhook(raw, { headers: {}, key: secret }));
  assert.throws(() => unwrapWebhook(raw, { headers, key: undefined }));
});
