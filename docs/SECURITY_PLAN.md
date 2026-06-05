# P.A.C.E. Security Plan

---

## 1. Authentication

### Provider
**Supabase Auth** — managed JWT-based authentication.

- Supabase handles password hashing (bcrypt), session tokens, and refresh tokens
- Never implement custom password handling
- Staff login: email + password
- Sessions stored in `localStorage` (Supabase default) or `httpOnly` cookies via a Netlify Function proxy if stricter security is needed later

### MVP Login Flow
```
Staff visits /portal
  → enters email + password
  → Supabase Auth verifies credentials
  → returns JWT access token + refresh token
  → React stores session via Supabase client
  → redirect to /portal/dashboard
```

### Password Policy (enforced in Supabase dashboard)
- Minimum 12 characters
- Supabase rate-limits failed attempts automatically
- Recovery via email reset link only (no security questions)

### Session Management
- Access tokens expire after 1 hour (Supabase default)
- Refresh tokens automatically renew sessions for active users
- On logout: call `supabase.auth.signOut()` to revoke server-side session
- Portal should detect expired session and redirect to `/portal` gracefully

### Inactivity Auto Sign-Out (Phase 13)
The staff portal contains sensitive customer, vehicle, repair order, inspection, estimate, invoice, and payment data. A client-side inactivity timer adds a defence-in-depth layer on top of the Supabase token expiry.

**Planned behaviour:**
- After 10 minutes of no user activity (mouse, keyboard, scroll, touch), show a warning modal.
- Warning gives the user a "Stay Signed In" option with a 60-second grace period.
- If not acknowledged, call `supabase.auth.signOut()` and redirect to `/portal`.
- Any user interaction resets the timer.

**Scope:** Portal-only. The timer runs only inside `PortalLayout` — public website visitors are unaffected.

**Security properties:**
- Does not store or log passwords or session tokens.
- Does not weaken Supabase RLS or server-side authentication.
- Supabase access tokens still expire independently on the server side (1 hour).
- After sign-out, all `ProtectedRoute` guards redirect unauthenticated users to `/portal` as normal.
- This is a UX-level protection for unattended workstations, not a replacement for server-side session expiry.

---

## 2. Protected Portal Routes

### React-Side Protection
All `/portal/*` routes must be wrapped in a `ProtectedRoute` component:

```
ProtectedRoute checks:
  → supabase.auth.getSession()
  → If no valid session → redirect to /portal (login)
  → If valid session → render the requested page
```

### What This Does NOT Protect
React route guards are a UI convenience only. They do not prevent API calls. Real data protection must come from:
- **Supabase Row Level Security (RLS)** on all tables
- **Netlify Function authentication checks** for any server-side operations

### Route Structure
```
/ (public)
/approve/:token (public, but data is token-gated server-side)
/portal (login page — redirect to dashboard if already logged in)
/portal/* (all wrapped in ProtectedRoute)
```

---

## 3. Supabase Row Level Security (RLS)

RLS must be **enabled on every table**. Default policy: deny everything. Then add explicit allow policies.

### General Staff Policies

For all portal data tables (`customers`, `vehicles`, `repair_orders`, etc.):

```sql
-- Allow authenticated staff to read all records
CREATE POLICY "staff_can_read"
  ON customers FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated staff to insert
CREATE POLICY "staff_can_insert"
  ON customers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated staff to update
CREATE POLICY "staff_can_update"
  ON customers FOR UPDATE
  USING (auth.role() = 'authenticated');
```

**No DELETE policies in MVP** — use soft deletes (`is_active = false`) to preserve data integrity and audit history.

### activity_logs Policy (Insert Only)
```sql
-- Staff can insert logs
CREATE POLICY "staff_can_log"
  ON activity_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Staff can read logs
CREATE POLICY "staff_can_read_logs"
  ON activity_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- No update or delete policies — logs are immutable
```

### approval_tokens (Accessed via Netlify Function, NOT direct client)
- No RLS policies that allow public/anon access
- Token lookups happen server-side in a Netlify Function using the **Supabase service role key**
- The service role key is only in Netlify environment variables, never in the React frontend

---

## 4. Secure Customer Approval Tokens

### Token Design
- Tokens are **UUID v4** strings generated server-side (`gen_random_uuid()` in Postgres or `crypto.randomUUID()` in Node)
- Stored hashed? For MVP: store plain UUID (sufficient entropy — 2^122 combinations). Future consideration: hash with SHA-256 before storage.
- Token lives in the `approval_tokens` table (see DATABASE_SCHEMA.md)

### Token URL
```
https://powerautomotive.ca/approve/{token-uuid}
```

### Server-Side Validation (Netlify Function)
Every request to `/approve/:token` must go through a Netlify Function that:
1. Receives the token from the URL
2. Queries `approval_tokens` using the **service role key** (bypasses RLS safely server-side)
3. Checks: `is_revoked = false` AND `expires_at > now()`
4. If invalid: returns 404 (do not reveal why — "not found or expired")
5. If valid: returns only the data the token type permits (estimate details OR inspection items + signed photo URLs)
6. For approval actions (customer clicks "Approve"): marks `used_at`, updates estimate status, logs to `activity_logs`

### What Customers Can Never Access via Token
- Other customers' data
- Internal notes (only customer-facing fields are returned)
- Other repair orders not linked to this token
- Raw Supabase Storage URLs (only short-lived signed URLs)

### Token Expiry and Revocation
- Default expiry: 7 days from `sent_at`
- Staff can revoke any token immediately via the portal (sets `is_revoked = true`)
- Expired or revoked tokens return the same 404 response (no information leakage)

---

## 5. Private Inspection Photo Storage

### Storage Setup
- Supabase Storage bucket: `inspection-photos`
- Bucket visibility: **Private** (no public access)
- File naming: `{repair_order_id}/{inspection_item_id}/{uuid}.jpg`

### Staff Access
- Supabase client authenticated as staff user
- Supabase RLS on Storage bucket allows authenticated users to read/write

### Customer Access via Approval Token
Only via a Netlify Function:
1. Customer visits `/approve/{token}` with a valid token
2. Netlify Function validates token (see section 4)
3. Function queries inspection photos for the linked RO
4. For each photo, function calls `supabase.storage.from('inspection-photos').createSignedUrl(path, 3600)` (1-hour expiry)
5. Returns signed URLs to the React client
6. Customer sees photos; signed URLs expire in 1 hour

### What Never Happens
- Never generate permanent public URLs for inspection photos
- Never store Supabase anon key in a context where it could be used to access the storage bucket directly
- Never embed photo URLs in emails (use the approval link instead)

---

## 6. Environment Variables

### Frontend (React/Vite) — Safe to Expose
These are embedded in the built JavaScript bundle. Only use truly public values here.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (safe — protected by RLS) |

**Rule:** Never put secret keys, service role keys, or API keys with write access in `VITE_` variables.

### Netlify Environment Variables — Server Only
Set in Netlify dashboard under Site Configuration → Environment Variables. Never committed to code.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (same as VITE_ version) |
| `SUPABASE_SERVICE_ROLE_KEY` | Full admin access key — server-side only |
| `RESEND_API_KEY` | Email sending — already configured |
| `BUSINESS_EMAIL` | Recipient for notifications — already configured |
| `FROM_EMAIL` | Sender address — already configured |
| `HELCIM_API_TOKEN` | Helcim invoice creation API — server-side only |
| `HELCIM_WEBHOOK_VERIFIER_TOKEN` | Verifies Helcim webhook signatures (Svix HMAC) — server-side only |
| `HELCIM_API_BASE_URL` | Helcim API base URL (defaults to https://api.helcim.com) |
| `SITE_URL` | Site origin for generating approval/payment links |

### Rules
- `SUPABASE_SERVICE_ROLE_KEY` must only be used in Netlify Functions
- No API secrets in `VITE_` prefixed variables
- No secrets in `src/` files
- `.env` file is in `.gitignore` — never commit it

---

## 7. No Credit Card Storage

This is a hard rule with no exceptions.

- The portal database will never contain: card numbers, CVV codes, expiry dates, or full PANs
- All payment processing is delegated to Helcim
- The only payment data stored locally: `helcim_invoice_id`, `helcim_payment_link`, and `payment_status` (`unpaid`/`partial`/`paid`)
- Payment status is updated either by a Helcim webhook (server-side verification required) or manually by staff

---

## 8. Webhook Verification (Implemented — Phase 9D)

Helcim uses Svix for webhook delivery. The webhook endpoint is `/.netlify/functions/payment-event-sync`.

1. Helcim sends a POST with Svix headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`
2. The function verifies the HMAC-SHA256 signature using `HELCIM_WEBHOOK_VERIFIER_TOKEN` (base64-decoded key)
3. Signed content: `{webhook-id}.{webhook-timestamp}.{rawBody}`
4. Comparison uses `crypto.timingSafeEqual` to prevent timing attacks
5. If signature is invalid: return 401, do not process
6. Duplicate events are detected via unique index on `helcim_event_id` — return 200 without reprocessing
7. Raw payload sanitized before database insert (card data fields removed)
8. If valid: update `helcim_invoices` and `repair_orders.payment_status` accordingly
9. Log the event to `helcim_payment_events` and `activity_logs`

Never trust webhook payload data without signature verification.

---

## 9. Audit Logging

Every significant action in the portal should write a row to `activity_logs`:

| Trigger | Action string |
|---|---|
| Repair order created | `repair_order.created` |
| Repair order status changed | `repair_order.status_changed` |
| Estimate sent to customer | `estimate.sent` |
| Customer approved estimate | `approval.estimate_approved` |
| Customer declined estimate | `approval.estimate_declined` |
| Token revoked | `token.revoked` |
| Invoice linked | `invoice.linked` |
| Payment status updated | `invoice.payment_status_changed` |
| Staff login | Handled by Supabase Auth logs |

Logs include `ip_address` for staff actions where available.

---

## 10. Backups

### Supabase Automatic Backups
- Supabase Pro plan includes daily automated backups with point-in-time recovery
- Free tier: manual backups only — upgrade to Pro before going live with real customer data

### Manual Backup Strategy (Free tier stopgap)
- Use Supabase dashboard → Table Editor → Export as CSV for critical tables monthly
- Store exports in a secure, encrypted location (not the GitHub repo)

### File Storage Backups
- Supabase Storage does not auto-backup on the free tier
- For inspection photos: consider periodic export to an S3-compatible backup
- Document which photos correspond to which repair orders via the database records

---

## 11. General Security Hygiene

- **HTTPS only** — Netlify enforces this automatically
- **No sensitive data in git** — use `.gitignore` for `.env`, any local config files
- **Dependency audits** — run `npm audit` before each major phase
- **Supabase anon key is safe but not secret** — RLS is the real protection layer
- **Portal login page should not be linked from the public site in V1** — known URL but not advertised
- **Rate limiting** — Netlify Functions have basic rate limiting; Supabase Auth has built-in brute-force protection
- **CORS** — Netlify Functions should validate `Origin` header for sensitive endpoints

---

## 12. Phase 11 — Production Readiness Audit (Complete)

Phase 11 confirmed the following security properties:

### Portal Route Protection
- All `/portal/*` routes are wrapped in `ProtectedRoute`, which checks `supabase.auth.getSession()` and redirects unauthenticated users to `/portal` (login).
- Session state is synced via `supabase.auth.onAuthStateChange()` to detect server-side revocation.
- Sign-out calls `supabase.auth.signOut()` and navigates with `replace: true` to prevent back-button bypass.
- Protected content is not rendered until session check completes (undefined state shows a loading screen).

### Tokenized Approval Links
- Customer estimate approval links use a raw UUID token in the URL only.
- The database stores only the SHA-256 hash of the token (`token_hash`), never the raw token.
- Token validation is server-side only (Netlify Function with service role key).
- Expired and revoked tokens return 404 / 410 without leaking reason detail.
- No anon RLS policies exist on `approval_tokens`, `estimates`, or `estimate_items`.

### Server-Only Secrets (Confirmed)
The following secrets are used only inside Netlify Functions — never in `src/`:
- `SUPABASE_SERVICE_ROLE_KEY`
- `HELCIM_API_TOKEN`
- `HELCIM_WEBHOOK_VERIFIER_TOKEN`
- `RESEND_API_KEY`

### Webhook Verification (Implemented — Phase 9D)
- Helcim payment events arrive at `/.netlify/functions/payment-event-sync`.
- Signature verified using HMAC-SHA256 with `HELCIM_WEBHOOK_VERIFIER_TOKEN` (base64-decoded) before any processing.
- Timing-safe comparison used (`crypto.timingSafeEqual`).
- Duplicate events are blocked by unique index on `helcim_event_id`.
- Raw payload sanitized before database insert — all card data fields removed.
- URL is neutral (does not contain "helcim") per Helcim delivery URL requirements.

### No Card Data Storage (Confirmed)
- `helcim_payment_events.raw_payload` is sanitized before insert (removes cardNumber, cardCVV, cardExpiry, bankAccountNumber, paymentToken, and related fields).
- `helcim_invoices` stores only reference IDs and payment links — no card details.
- `repair_orders` payment fields store only status and reference (unpaid/partial/paid).

### Server Log Hygiene (Phase 11 Fix)
- Customer email addresses in server logs are now partially redacted (e.g., `ja***@gmail.com`).
- No API tokens, service role keys, or raw approval tokens appear in any log.

### Staff-Only Pricing Fields Isolation (Phase 13D)

Phase 13D added internal cost/markup columns to `estimate_items`. The following isolation guarantees are in place and must be preserved in all future changes:

**Columns that are STAFF-ONLY (never customer-facing):**
- `estimate_items.cost_cents`
- `estimate_items.markup_percent`

**How isolation is enforced — explicit column allowlists in every customer-facing function:**

| Function | `estimate_items` select columns used |
|---|---|
| `get-approval-estimate.js` | `id, item_type, description, quantity, unit_price_cents, line_total_cents, is_required, approval_status` |
| `send-estimate-approval.js` | `id, description, item_type, quantity, unit_price_cents, line_total_cents, is_required` |
| `submit-estimate-approval.js` | `id, item_type, description, line_total_cents, is_required, approval_status` |
| `helcim-create-invoice.js` | `description, quantity, unit_price_cents, line_total_cents, item_type, sort_order` |

None of these lists include `cost_cents`, `markup_percent`, or `customer_unit_price_cents`.
`unit_price_cents` remains the authoritative customer-facing price for all totals.

**Rule:** Any future change to these functions must preserve the explicit allowlist. Never use `select: *` in customer-facing or Helcim-facing functions for `estimate_items`.

---

## 13. Phase 13E — Canned Jobs / Preset Job Bundles Security Notes (Complete)

### Isolation of cost_cents and markup_percent on canned_job_items

`canned_job_items.cost_cents` and `canned_job_items.markup_percent` are staff-only fields. When `addCannedJobToEstimate()` copies items to `estimate_items`, it preserves these values in `estimate_items.cost_cents` and `estimate_items.markup_percent`. The isolation guarantees from Phase 13D (explicit column allowlists in all four customer-facing Netlify Functions) automatically protect these copied values — no additional changes to customer-facing functions are required.

**Columns that remain STAFF-ONLY on both `canned_job_items` and `estimate_items`:**
- `cost_cents`
- `markup_percent`

**Confirmed zero exposure in customer-facing functions (Phase 13E audit):**

| Function | Result |
|---|---|
| `get-approval-estimate.js` | 0 references to `cost_cents`, `markup_percent`, `customer_unit_price_cents` |
| `send-estimate-approval.js` | 0 references |
| `submit-estimate-approval.js` | 0 references |
| `helcim-create-invoice.js` | 0 references |

**Rule:** The Manage Canned Jobs panel and `addCannedJobToEstimate()` are staff-portal-only operations behind `ProtectedRoute`. No canned job management endpoint is exposed to unauthenticated users.

---

## 14. Phase 14 — Print, Document, and Modal Security Notes (Planning)

These rules apply when Phase 14 is implemented. Record them here so they are not forgotten during implementation.

### 14B — Printable Customer Invoice

- The customer invoice print layout must use only customer-facing price fields: `unit_price_cents`, `line_total_cents`, `subtotal_cents`, `tax_cents`, `total_cents`, `amount_due_cents`.
- `cost_cents`, `markup_percent`, and `customer_unit_price_cents` must **never** appear on the printed customer invoice.
- Internal notes (staff-only fields on estimate items or repair orders) must not appear unless owners explicitly approve each field.
- The print layout must be rendered inside the authenticated staff portal only — it must not be accessible at a public URL without a valid session or approval token.
- If a printable route is added (e.g. `/portal/invoice/:id/print`), it must be wrapped in `ProtectedRoute`.
- No card data, Helcim API tokens, service role keys, or raw approval tokens may appear in print output or in the JavaScript that generates it.

### 14C — Printable Internal Repair Order

- The internal RO print layout is **staff-only**. It must only be accessible inside authenticated portal routes.
- It may include fields not shown to customers: internal notes, cost fields, markup, odometer details, service advisor name, etc. — subject to owner approval of which fields are included.
- Public users must not be able to reach internal RO print routes. No unauthenticated access.
- Do not generate a shareable public URL for internal RO printouts.

### 14D — RO Concerns to Estimate Job Groups

- Any new `estimate_jobs` table or `estimate_items.estimate_job_id` column must follow the same RLS rules as `estimate_items`: authenticated staff only, no anon access, no DELETE policy.
- Job notes (internal staff notes per concern/job) must be excluded from `get-approval-estimate.js` and all customer-facing function `select:` lists.
- Only customer-visible notes/titles should appear in the approval email and customer approval page.
- If `estimate_jobs` is added, update the explicit column allowlists in all four customer-facing functions (`get-approval-estimate.js`, `send-estimate-approval.js`, `submit-estimate-approval.js`, `helcim-create-invoice.js`) before deploying.
- Helcim invoice creation must continue using only `unit_price_cents` and `line_total_cents` — never cost or markup from any grouping table.
