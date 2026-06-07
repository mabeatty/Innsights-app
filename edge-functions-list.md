# Innsights — Supabase Edge Functions

This document lists every Supabase Edge Function in the project (`supabase/functions/`), what it does, and the environment variables / secrets it requires.

There are **20 edge functions**. Set their secrets in the Supabase dashboard under **Project Settings → Edge Functions → Secrets**, or via `supabase secrets set KEY=value`.

## JWT verification (`supabase/config.toml`)

By default all functions run with `verify_jwt = true`. The following three are explicitly set to `verify_jwt = false` (they are public webhooks / cron targets):

| Function | verify_jwt | Reason |
|---|---|---|
| `receive-invoice-email` | `false` | Public Resend inbound-email webhook |
| `check-alerts` | `false` | Cron-invoked, runs with service role |
| `export-aia-excel` | `false` | Still manually requires an `Authorization` header internally |

> Note: most functions perform their own auth check (reading the `Authorization` header and calling `auth.getUser`) even when JWT verification is on.

---

## Environment variables — master list

Set these as needed depending on which integrations you use:

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | almost all | Standard Supabase env (auto-provided in Supabase) |
| `SUPABASE_ANON_KEY` | most user-facing functions | Standard Supabase env |
| `SUPABASE_SERVICE_ROLE_KEY` | service/cron/admin functions | **Secret** — bypasses RLS |
| `PLAID_CLIENT_ID` | Plaid functions | Plaid (production) |
| `PLAID_PRODUCTION_SECRET` | Plaid functions | Plaid (production) |
| `Intuit_ID` | QuickBooks functions | Intuit OAuth **client id** |
| `Intuit_Secret` | QuickBooks functions | Intuit OAuth **client secret** |
| `LOVABLE_API_KEY` | AI functions | Lovable AI Gateway |
| `RESEND_API_KEY` | `send-invoice-email` | Resend outbound email |
| `RESEND_FROM` | `send-invoice-email` | Optional; falls back to a default from-address |
| `DEFAULT_INVOICE_ORG_ID` | `receive-invoice-email` | Org that owns email-intake invoices |

---

## Plaid — bank connections & transactions

### `create-link-token`
Creates a Plaid Link token for the authenticated user so the frontend can launch Plaid Link to connect a bank account.
- **Env:** `PLAID_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **External:** Plaid `link/token/create` (production)

### `exchange-public-token`
Exchanges a Plaid `public_token` for a long-lived `access_token` after a user links a bank, then stores the connection (access token, item id, institution info) in `plaid_connections`.
- **Env:** `PLAID_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** Plaid `item/public_token/exchange`

### `sync-transactions`
Pulls transactions (default last 30 days, paginated) for all active `plaid_connections`, upserting accounts into `plaid_accounts` and transactions into `plaid_transactions`. Runs with the service role (suitable for cron) and flips connection status to Active/Error.
- **Env:** `PLAID_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** Plaid `transactions/get`

---

## QuickBooks / Intuit — accounting integration

> These functions read the client id from **`Intuit_ID`** and the secret from **`Intuit_Secret`**.

### `quickbooks-auth-url`
Generates the Intuit OAuth2 authorization URL (with a random state) to begin connecting QuickBooks. Verifies the Supabase user first.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `Intuit_ID`
- **External:** Intuit OAuth (`appcenter.intuit.com/connect/oauth2`)

### `quickbooks-callback`
Handles the OAuth callback: exchanges the auth code + `realm_id` for access/refresh tokens, fetches the company name, and upserts the connection (one per org) into `quickbooks_connections`.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `Intuit_ID`, `Intuit_Secret`
- **External:** Intuit OAuth token endpoint; QuickBooks `companyinfo` API

### `quickbooks-sync-accounts`
Refreshes the QB token if needed, queries the full Chart of Accounts, then replaces (delete + insert) the org's rows in `chart_of_accounts`.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `Intuit_ID`, `Intuit_Secret`
- **External:** Intuit OAuth token refresh; QuickBooks Query API (`SELECT * FROM Account`)

### `quickbooks-push-expense`
For a given expense `report_id`, refreshes the QB token, loads the report's `plaid_transactions` (joined to `chart_of_accounts`), maps each to a QB expense account, and creates a Purchase (expense) per transaction in QuickBooks.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `Intuit_ID`, `Intuit_Secret`
- **External:** Intuit OAuth token refresh; QuickBooks Query + Purchase create API

---

## ClickUp — task sync

> Raw-token `console.log` lines have been removed from both functions. Note that `manage-clickup-token` can still include raw token values in its `debug` response payloads.

### `manage-clickup-token`
Manages a per-org ClickUp API token stored in the `integrations` table. Supports actions `test` (validate), `save` (validate + upsert), and `status` (check stored token validity).
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** ClickUp `api/v2/user`

### `fetch-clickup-tasks`
Given a `list_id` and `org_id`, reads the org's ClickUp token from `integrations` and fetches tasks (including closed/subtasks) for that list, returning a simplified task list.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** ClickUp `api/v2/list/{list_id}/task`

---

## Email — Resend (inbound + outbound)

### `receive-invoice-email`  _(verify_jwt = false)_
Public Resend **inbound** webhook. Parses a forwarded email, filters PDF attachments, uploads each to the `invoices` storage bucket, creates a 30-day signed URL, and inserts a pending invoice (status "Pending — Needs Review", source "email") plus an audit-trail row. Assigns email-intake invoices to a fixed org.
- **Env:** `DEFAULT_INVOICE_ORG_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** Resend inbound webhook (no outbound call)

### `send-invoice-email`
Sends invoice notification emails via Resend, with an optional PDF attachment (downloaded from the `invoices` bucket via the service role and base64-encoded). Verifies the user first.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_FROM` _(optional)_
- **External:** Resend `api.resend.com/emails`

### `send-document-email`  _(⚠️ stub)_
Intended to email a document/notification to recipients. **Currently a non-functional stub** — it verifies the user and checks for `LOVABLE_API_KEY` but does not actually send anything; it only logs and returns success.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY`
- **External:** None actually called

---

## AI / LLM — Lovable AI Gateway

### `extract-invoice-pdf`
Verifies the user, then sends a base64 PDF to the Lovable AI Gateway (Gemini 2.5 Pro) to extract `vendor_name`, `invoice_number`, `invoice_date`, and `amount`, returning the parsed JSON.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY`
- **External:** Lovable AI Gateway (`ai.gateway.lovable.dev`, model `google/gemini-2.5-pro`)

### `summarize-weekly-reports`
Takes an array of weekly construction reports and uses the Lovable AI Gateway (Gemini 3 Flash preview, via a forced `return_bullets` tool call) to produce 5–8 concise investor-report bullet points. No Supabase client / auth.
- **Env:** `LOVABLE_API_KEY`
- **External:** Lovable AI Gateway (`ai.gateway.lovable.dev`, model `google/gemini-3-flash-preview`)

---

## Excel export — AIA payment documents

### `export-aia-excel`  _(verify_jwt = false)_
Downloads an `AIA_G702_703.xlsx` template from the `templates` storage bucket and fills it in-place via low-level XML/JSZip manipulation (preserving formatting/formulas), populating G702/G703/Detail sheets from request data. Still requires an `Authorization` header internally.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** None (JSZip from esm.sh; Supabase storage only)

### `export-budget-excel`
Generates an AIA G702/G703 + Detail workbook from scratch using SheetJS (`xlsx`). Verifies the user, loads project / project_info / budget / transaction data, computes all AIA payment-application figures, and returns the XLSX.
- **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **External:** None (SheetJS; Supabase only)

---

## Alerts — scheduled checks

### `check-alerts`  _(verify_jwt = false)_
Cron-style function (service role) that scans all projects and generates/resolves rows in the `alerts` table across categories: budget/cost (over budget, line-item over budget, spend threshold), schedule (overdue milestones, missing weekly report), capital/cash (equity/debt over commitment), and document/compliance (no draw activity). Respects per-org `alert_settings` and avoids duplicate alerts.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **External:** None (database only)
- **Scheduling:** Intended to be invoked on a schedule (the DB enables `pg_cron` / `pg_net`).

---

## Team / org management

### `get-team-activity`
Verifies the caller, finds their org, and returns all org members with email, first/last name (from `profiles`), and `last_sign_in_at` (via the Supabase Admin auth API).
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **External:** Supabase Admin auth API

### `get-team-emails`
Given a list of `userIds`, returns their email addresses — but only for users in the same org as the caller.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **External:** Supabase Admin auth API

### `invite-team-member`
Verifies the caller and their org, then invites a new user by email (or looks them up if already registered) and inserts them into `organization_members` with role / expense-role / supervisor / investment-access / access-level fields.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **External:** Supabase Admin auth invite API

---

## Security observations

1. ✅ **Fixed — `Intuit_ID` typo** — the QuickBooks functions now read the client id from the correctly spelled `Intuit_ID` secret (previously `Inuit_ID`).
2. ✅ **Fixed — ClickUp raw-token logging** — the `console.log` lines that printed raw ClickUp tokens (and request headers containing the token) were removed from `manage-clickup-token` and `fetch-clickup-tasks`. A redacted log (last 6 chars only) remains.
3. ⚠️ **Still open — `send-document-email` is a non-functional stub** — it requires `LOVABLE_API_KEY` but never actually sends an email; it only logs and returns success.
4. ⚠️ **Still open — `manage-clickup-token` debug responses** — the function can still return raw token values inside its `debug` response payloads (separate from console logging). Worth reviewing if exposed to clients.
