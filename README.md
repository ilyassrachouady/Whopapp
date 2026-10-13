# Payment Desk

Focused internal sales checkout MVP. Next.js App Router, TypeScript, Tailwind, shadcn-style UI primitives, Radix Select, Lucide and Supabase. No analytics dashboard.

## Run

Node 22+ recommended (required by the current Supabase SDK).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Select John Smith → Coaching Program → Pay in Full → Lewis Kirby → Generate payment link. Copy the link or open the local mock checkout preview. SMS/email show honest placeholder notifications.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Persistence and Supabase

Without Supabase credentials, local sessions persist as individual files in ignored `.data/`. This is for single-machine development. For Vercel, set `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`, apply `supabase/migrations/001_initial.sql`, then `supabase/seed.sql`. No anonymous database access is permitted. Set `DESK_PASSWORD` and optionally `DESK_USERNAME` for deployment; the internal tool uses Basic authentication over HTTPS. Vercel fails closed without authentication and persistent storage configuration.

## Configuration and integration boundaries

`lib/config.ts` is the central offer/prospect/closer configuration. Prices are integer USD cents. To change an offer, update the central price and its database record; provision corresponding live Whop plans before enabling live checkout. Client input only contains IDs and terms. The server recalculates the plan and builds metadata from trusted configuration.

`lib/whop.ts` automatically returns a working local mock preview when `WHOP_API_KEY` is absent. With a key, it uses Whop checkout configurations and requires `WHOP_PLAN_IDS_JSON`, for example `{"coaching:pif":"plan_verified_id"}`. Plans must match the configured prices and schedules. Custom live plans fail clearly until implemented. Live API behavior has not been tested against an account. No keys go to the browser.

`lib/ghl.ts` contains separate mock contact data and a live contact lookup. `/api/ghl/contact/:id` is the replacement seam for the prospect selector. Other GHL methods are explicit disabled/mock boundaries, not simulated successful sends. The selector currently uses the central seed records. “Configured” means credentials exist, not verified connectivity.

`POST /api/checkouts` validates, recalculates, creates and persists sessions. Changes to any input clear the displayed checkout, preventing stale links. Generated sessions snapshot price and attribution. In local mock mode, `/checkout/:id` opens a saved preview; it does not collect money. If persistence fails after a live Whop call, an orphan checkout may exist: reconcile provider sessions before retrying in live operation.

## Mock webhook

Set `WHOP_WEBHOOK_SECRET` and send `x-mock-webhook-secret` with:

```json
{
  "id": "evt_test",
  "type": "payment.succeeded",
  "checkout_session_id": "<saved UUID>",
  "whop_payment_id": "mock_pay_1",
  "amount_collected": 199700
}
```

The endpoint is mock-only and fails closed with a live Whop key. Supabase's atomic `record_payment` function deduplicates provider payment IDs, sums actual cash and updates session status. GHL writes and downstream automations remain disabled. Enable official Whop signature verification, map verified live event payloads and add retries/outbox handling before receiving live events. Local event files are a development audit trail, not a production payment ledger.

## Metrics

Contract value is never counted as collected cash. `payments.amount_collected` is actual cash; a checkout alone contributes zero. PIF means a single full payment on a PIF structure. Call IDs and closer IDs support future attribution, but all sales calls (including unsold calls) must be ingested before computing close rate or cash per call.

## Post-call workflow

The desk starts with only prospect and call outcome. Sold reveals the existing payment flow; Follow-up, No Sale, No Show and Unqualified show only their relevant fields. Closers and attribution stay auto-filled. Complete Call is the final submission; Start Next Call clears the draft and selects the next seeded prospect.

`lib/calls.ts` exposes the single server-side `completeCall()` boundary. `POST /api/calls/complete` validates the outcome, rebuilds CRM/attribution context from the prospect and closer seeds, and attaches an already saved checkout for Sold. It resolves the selected local date and time on the server using the automatically captured browser time zone, and rejects past or nonexistent local times. An existing call ID returns its original record on retries, including concurrent clicks. A call can only be completed once; a new appointment must have a new call ID in future CRM-backed prospect data.

Local mock records persist in ignored `.data/calls/`. For Supabase, apply `supabase/migrations/002_call_records.sql` after the initial migration. The records use a unique call ID and RLS; no browser database permissions are granted. Records are marked `sync_status=pending` and `mode=mock`: “CRM ready to sync” means saved locally, not that GHL was updated. Future CRM stage updates, notes, follow-up tasks and reporting can consume these records through the single completion boundary. No history dashboard or live CRM automation is included.

Generating a checkout is preparation, not a call report or collected payment. Sold records snapshot contract value and amount **due today**, while only verified payment events represent actual collected cash.

All bundled contacts are synthetic demo fixtures with reserved example.com emails, fictional 555 phone numbers, and invented CRM/attribution identifiers. No real contact export is included. Local runtime data and credentials are ignored by Git.
