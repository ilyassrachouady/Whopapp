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

Without Supabase credentials, local sessions persist as individual files in ignored `.data/`. This is for single-machine development. For Vercel, set `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`, apply `supabase/migrations/001_initial.sql`, then `supabase/seed.sql`. No anonymous database access is permitted. Production uses Supabase email-link authentication. Set `DESK_AUTH_MODE=supabase` and `DESK_ALLOWED_EMAILS=*` so any valid email can request a sign-in link. Anyone who opens that link can use CRM contacts and live checkout tools, so keep the login URL private. The legacy Basic authentication path is inactive in this mode. Vercel fails closed without authentication and persistent storage configuration.

## Configuration and integration boundaries

`lib/config.ts` is the central offer/prospect/closer configuration. Prices are integer USD cents. To change an offer, update the central price and its database record; provision corresponding live Whop plans before enabling live checkout. Client input only contains IDs and terms. The server recalculates the plan and builds metadata from trusted configuration.

`lib/whop.ts` uses the official Whop SDK. Without `WHOP_API_KEY`, local mock previews work as before. With a key, `WHOP_SANDBOX=true` (the default) selects the sandbox; set `WHOP_SANDBOX=false` only for production. Supply `WHOP_COMPANY_ID` and `WHOP_PLAN_IDS_JSON`, e.g. `{"coaching:pif":"plan_verified_id"}`. The service retrieves each plan and verifies its company, USD amount due, billing model and finite installment count before creating a checkout. Custom schedules remain gated until a matching provider schedule is verified. Credentials are never sent to the browser.

Installments now keep all future payments equal, with rounding in the first payment: a $1,997 three-pay contract is $665.68 today and two $665.66 payments every 30 days. Configure Whop plans to match this exact schedule. Whop's `initial_price_due` is checked because recurring plans may charge an initial price plus the first renewal at checkout.

`lib/catalog.ts` loads prospects, closers and active offer prices from Supabase when configured. No mock fallback occurs on database errors. Apply migrations 001, 002 and 003, then seed the database. Without database credentials, local synthetic fixtures remain available. Real prospects must have real CRM IDs and unique call IDs; demo IDs cannot be used for GHL sends.

`lib/ghl.ts` implements account-scoped contact/opportunity reads, SMS/email sends, opportunity updates, notes and follow-up tasks against the public GHL API. Configure `GHL_API_KEY`, `GHL_LOCATION_ID` and a verified `GHL_EMAIL_FROM`; `GHL_WRITES_ENABLED=true` enables writes after account confirmation. The send buttons use saved checkout sessions rather than browser-supplied recipients. Sandbox messages are restricted to `GHL_TEST_CONTACT_IDS_JSON`. Automatic call-to-pipeline syncing remains pending until the target account and stage/field mappings are agreed; no stages or fields are invented.

`POST /api/checkouts` validates, recalculates, creates and persists sessions. Changes to any input clear the displayed checkout, preventing stale links. Generated sessions snapshot price and attribution. In local mock mode, `/checkout/:id` opens a saved preview; it does not collect money. If persistence fails after a live Whop call, an orphan checkout may exist: reconcile provider sessions before retrying in live operation.

## Payment webhooks

`POST /api/webhooks/whop` has two separate paths. With a Whop key, it verifies Standard Webhooks signatures using the SDK against the exact raw body, retrieves the payment from Whop, checks its paid state, company, USD currency, checkout ID and stored session metadata, then records actual collected cash through an atomic Supabase RPC. Failed processing returns a retryable 503. Register the endpoint URL and subscribe to `payment.succeeded`; set the endpoint's actual `WHOP_WEBHOOK_SECRET`.

Without a Whop key, mock requests use `x-mock-webhook-secret` and `WHOP_WEBHOOK_SECRET`:

```json
{
  "id": "evt_test",
  "type": "payment.succeeded",
  "checkout_session_id": "<saved UUID>",
  "whop_payment_id": "mock_pay_1",
  "amount_collected": 199700
}
```

Provider payment IDs are deduplicated and cannot be reassigned to another session. Local event files are a development audit trail; Supabase is required for sandbox/production payment processing. Refund/dispute reconciliation and payment-to-GHL reporting are not enabled yet.

`GET /api/integrations/status`, protected by the desk's authentication, checks the database catalog and reports missing or configured provider settings without exposing keys. A configured key is not proof of provider connectivity.

## Metrics

Contract value is never counted as collected cash. `payments.amount_collected` is actual cash; a checkout alone contributes zero. PIF means a single full payment on a PIF structure. Call IDs and closer IDs support future attribution, but all sales calls (including unsold calls) must be ingested before computing close rate or cash per call.

## Post-call workflow

The desk starts with only prospect and call outcome. Sold reveals the existing payment flow; Follow-up, No Sale, No Show and Unqualified show only their relevant fields. Closers and attribution stay auto-filled. Complete Call is the final submission; Start Next Call clears the draft and selects the next seeded prospect.

`lib/calls.ts` exposes the single server-side `completeCall()` boundary. `POST /api/calls/complete` validates the outcome, rebuilds CRM/attribution context from the prospect and closer seeds, and attaches an already saved checkout for Sold. It resolves the selected local date and time on the server using the automatically captured browser time zone, and rejects past or nonexistent local times. An existing call ID returns its original record on retries, including concurrent clicks. A call can only be completed once; a new appointment must have a new call ID in future CRM-backed prospect data.

Local mock records persist in ignored `.data/calls/`. For Supabase, apply `supabase/migrations/002_call_records.sql` after the initial migration. The records use a unique call ID and RLS; no browser database permissions are granted. Records are marked `sync_status=pending` and `mode=mock`: “CRM ready to sync” means saved locally, not that GHL was updated. Future CRM stage updates, notes, follow-up tasks and reporting can consume these records through the single completion boundary. No history dashboard or live CRM automation is included.

Generating a checkout is preparation, not a call report or collected payment. Sold records snapshot contract value and amount **due today**, while only verified payment events represent actual collected cash.

All bundled contacts are synthetic demo fixtures with reserved example.com emails, fictional 555 phone numbers, and invented CRM/attribution identifiers. No real contact export is included. Local runtime data and credentials are ignored by Git.

## Public client demo

Set `PUBLIC_DEMO=true` on a separate deployment. The page uses only the synthetic catalog, runs checkout generation and call completion in the browser, keeps mock call records in sessionStorage, and simulates SMS/email without requests. Generated links use `/demo-checkout` and query parameters so previews can be opened in another browser. Middleware blocks every `/api/*` and persisted `/checkout/*` route, while bypassing desk authentication only for the demo. Do not add provider credentials to this deployment. The private app keeps its existing access protection.

### Client workflow revision

Attendance is recorded separately from sales outcome. Only attended calls expose Sold, Follow-up, No Sale or Unqualified. Other attendance choices save a null outcome. All public demo actions remain simulated.

Open `/call?contactId=mock_john`, `mock_emma`, or `mock_alex` to load the prospect, assigned closer and attribution automatically. `lib/prospect-service.ts` provides an injectable GHL lookup boundary; the default adapter uses synthetic fixtures only. Unknown contacts show an explicit fallback warning.

Coaching fixed-plan pricing is centralized in `lib/config.ts`: PIF $1,997, two payments of $1,200, or three payments of $800. Selected plan totals propagate to summaries, checkout metadata and completed reports. Custom plans retain their existing contract-value validation. Whop plan/checkout identifiers are prepared as nullable configuration fields.

`004_attendance_outcomes.sql` migrates the private database reports to attendance + nullable outcome; it is not required or applied for the public mock demo.

### Deposits and payment-driven onboarding

Attended calls now support Deposit: arbitrary positive USD amount, required future follow-up date/time, one-time checkout, then one Complete Call action. Deposit sessions have no sale offer, contract or installment plan. Editing the deposit or follow-up invalidates its checkout so the saved report cannot disagree with payment metadata. Follow-up details are saved; this does not book a live GHL calendar appointment.

A generated checkout is pending payment. A verified Whop payment event is the only entry into customer automation. A sale's **first successful installment** onboards once per checkout, independently of whether its full balance is paid. Deposit payments only notify `#sales-deposits`; they never change Contact Type, send the full welcome email, or provision product access.

`payment-success.ts` persists payment money before calling separate customer, Slack, welcome and product-access services. `payment-store.ts` records unique Whop payment IDs, rejects reassigned/mismatched replays and overpayments, and keeps per-action receipts and retry leases. Completed steps are skipped on retry; failed steps resume. Providers without native idempotency can still duplicate a side effect if their request succeeds but the response/receipt is lost. Reconcile ambiguous external failures before retrying them in production.

Apply migrations `004_attendance_outcomes.sql` and `005_deposits_and_payment_actions.sql` with the intended schema in `search_path` before using private persistent processing. Neither migration was applied to the client's live database in this change. The new functions capture that schema so the isolated `payment_desk` install does not write into public tables. `call_records` remains the existing call-report source of truth.

Modes default to mock, even when credentials exist. Explicit `WHOP_MODE=real` creates sandbox/live links using server-side credentials; `WHOP_SANDBOX` defaults true. Deposits use an inline, product-free one-time Whop plan so a deposit cannot automatically grant the sale product's Whop membership. The returned plan is checked for exact USD price and one-time billing.

Post-payment external actions require a live checkout and `PAYMENT_AUTOMATION_MODE=real`. By default `PAYMENT_WORKFLOW_OWNER=ghl` makes **one** enrollment into the configured existing `GHL_PAYMENT_WORKFLOW_ID`; that verified workflow must own native Customer status, Slack, welcome email and eventual access. The app does not send those separately in that mode. For app-owned orchestration, `WELCOME_EMAIL_MODE=direct` requires approved configured copy, and `GHL_CUSTOMER_TYPE_WORKFLOW_ID` delegates native Contact Type to a verified workflow because the public contact PUT schema does not document it. No undocumented native type write is assumed.

Slack mock calls log short structured payloads for the agreed channels. Real Slack needs `SLACK_MODE=real`, a bot token and channel IDs. GHL writes additionally require `GHL_MODE=real` and `GHL_WRITES_ENABLED=true`. Keep sandbox notifications mocked. Pablo always returns `pending_integration`; it grants no access until Sofia confirms a real mechanism. No closer Whop account is needed.

## Production deployment

The private desk is deployed at https://whopapp-wine.vercel.app. The public demo is a separate Vercel project. Production uses encrypted Vercel environment variables and the isolated Supabase `payment_desk` schema. Local fixtures, `.env.local`, `.ghl`, and `.data` are excluded from deployment.

Whop delivers `payment.succeeded` to `/api/webhooks/whop`; signature and provider receipt validation precede the durable GHL inbound-webhook handoff. The first successful sale installment starts onboarding once per sale. Whop plan prices and installment counts are verified on checkout creation.

Set `PAYMENT_DESK_LOCAL_TEST=false`, `WHOP_MODE=real`, `WHOP_SANDBOX=false`, `GHL_MODE=real`, `GHL_WRITES_ENABLED=true`, `PAYMENT_AUTOMATION_MODE=real`, `PAYMENT_WORKFLOW_OWNER=ghl`, and `PUBLIC_DEMO=false`. Configure `GHL_PAYMENT_WEBHOOK_URL`, Supabase service credentials, desk login and Whop company/API/webhook credentials server-side.

Deposits are blocked on Vercel until real Slack deposit credentials are configured. Pablo provisioning remains pending, and the welcome email promises follow-up access details rather than claiming access was granted. The authenticated CRM picker searches GoHighLevel by name, email or phone, verifies the selected contact belongs to the configured location, and saves its desk context in Supabase before checkout. Synthetic fixture contacts are filtered from live mode. A completed desk call receives a new context when the contact is selected again.

Supabase must allow the exact callback URL `https://whopapp-wine.vercel.app/auth/callback`. Keep existing redirect URLs and the shared project Site URL unchanged. The service role key stays server-side. Access and refresh tokens use HttpOnly cookies; sessions are verified against Supabase and checked against the desk email allowlist on protected requests. Sign-out is scoped to the current session.

### Approved GHL closers
Live closer choices are loaded from GHL users and filtered by `GHL_CLOSER_USER_IDS` (comma-separated IDs). The Creator Society defaults to Brooklyn Martin only. This is a Payment Desk designation, not a GHL security role/custom field. Add a GHL user ID to this setting and redeploy to approve another closer. Existing saved closer rows remain for historical reports but are not automatically selectable. The `Other` choice requires a name, stores it in checkout metadata and call reports, and never creates a GHL user or login. `users.readonly` is required.

Completed calls write a real GHL contact note containing attendance, outcome, closer, notes, and recording link. The report UUID is included as a reference and checked before writing on retries. Notes and owner assignment have separate visible statuses; Retry GHL sync retries either failed operation without creating a new call report. Payment status remains driven by verified Whop events.
