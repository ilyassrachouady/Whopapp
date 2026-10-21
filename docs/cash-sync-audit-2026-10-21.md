# Cash sync audit — 21 October 2026

## Live reconciliation

Direct GHL public API and the dashboard's actual live adapter both returned 26 reporting contacts, 5 Sold, Cash Collected total USD 7,791, PIF 2, Manual Payment Plan 1, Financing 0. Data changed during the audit: the earlier direct read included a zero-cash test Sold contact. No contacts were edited by this audit. Financing could not be checked against a real classified contact because none exists.

## Fixed locally in Payment Desk

- No-show, cancelled, rescheduled, follow-up and no-sale field writes no longer erase Cash Collected, Agreed Total Investment, First Payment Date or Payment Structure.
- Unconfirmed deposits no longer clear those financial fields. Confirmed deposit snapshots may write cash/date without clearing investment or structure.
- Call completion preserves existing positive GHL Cash Collected rather than replacing it with amount due today. An empty snapshot does not erase First Payment Date.
- These guards apply to call completion. Explicit confirmed-payment processing remains a separate path.

## Not yet reconciled / remaining engineering work

1. `payment-success.ts` sends the cumulative total for one checkout to GHL. It is not a lifetime contact total. Multiple checkouts or pre-existing manually recorded cash can be overwritten by this path. A contact ledger with verified ownership, a migration baseline and serialized updates is needed before changing this to a contact-wide total. Do not simply add webhook amounts to GHL: retries could double-count money.
2. Only `payment.succeeded` events are processed by `whop-events.ts`. Refunds are ignored. Do not describe GHL Cash Collected as automatically refund-adjusted.
3. Successful payments created outside Payment Desk are deliberately ignored by its webhook. The dashboard can show Whop history separately, but that does not update CRM cash.
4. Completing a Sold call without confirmed receipts can still initialize blank/zero CRM cash from amount due today. This is CRM-reported cash, not proof of receipt. An explicit collected-at-call input/confirmation would be needed to change that behavior without losing the team's manual collection workflow.
5. No live charge, refund or customer write was performed. Success/duplicate/installment flows are covered in local tests; production provider delivery was not exercised.

## Test verification

Two stale deposit assertions were first reproduced on the original HEAD code, then corrected: edited completion now checks the stable record ID and exactly one saved record, and mock deposit processing checks the mock-only handoff rather than an obsolete Slack-channel receipt. The complete suite now passes 58 tests. TypeScript passes.
