import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCallProspect } from "../lib/prospect-service";
test("Slack contact links resolve prospect and attribution through the GHL service boundary", async () => {
  const john = await loadCallProspect("mock_john");
  assert.equal(john?.full_name, "John Smith");
  assert.equal(john?.closer_id, "lewis");
  assert.ok(
    john?.appointment_id && john?.ghl_opportunity_id && john?.utm_campaign,
  );
  assert.equal((await loadCallProspect("mock_emma"))?.closer_id, "sofia");
  assert.equal(await loadCallProspect("missing"), null);
  let received = "";
  await loadCallProspect("real-id", {
    async getByContactId(id) {
      received = id;
      return null;
    },
  });
  assert.equal(received, "real-id");
});
