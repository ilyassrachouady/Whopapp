import test from "node:test";
import assert from "node:assert/strict";
import { resolveCloser, OTHER_CLOSER_ID } from "../lib/closer-selection";
const roster = [
  {
    id: "brooklyn",
    name: "Brooklyn Martin",
    email: "test@example.com",
    initials: "BM",
    ghl_user_id: "ghl-user",
  },
  {
    id: OTHER_CLOSER_ID,
    name: "Other",
    email: "",
    initials: "O",
    ghl_user_id: null,
  },
];
test("only approved roster members can be selected", () => {
  assert.equal(resolveCloser(roster, "lewis"), undefined);
  assert.equal(
    resolveCloser(roster, "brooklyn", "Forged name")?.name,
    "Brooklyn Martin",
  );
});
test("Other requires a name and preserves external closer attribution without a GHL user", () => {
  assert.throws(() => resolveCloser(roster, OTHER_CLOSER_ID, " "));
  const closer = resolveCloser(roster, OTHER_CLOSER_ID, "  Guest Closer  ");
  assert.equal(closer?.name, "Guest Closer");
  assert.equal(closer?.ghl_user_id, null);
  assert.equal(closer?.id, OTHER_CLOSER_ID);
});
