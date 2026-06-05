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
| `HELCIM_API_KEY` | Future: Helcim API access — server-side only |
| `HELCIM_WEBHOOK_SECRET` | Future: for verifying Helcim webhook signatures |

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

## 8. Webhook Verification (Future — Helcim)

When Helcim webhooks are enabled:

1. Helcim sends a POST to a Netlify Function endpoint
2. The function verifies the request signature using `HELCIM_WEBHOOK_SECRET` (HMAC-SHA256)
3. If signature is invalid: return 401, do not process
4. If valid: update `invoices.status` and `repair_orders.payment_status` accordingly
5. Log the event to `activity_logs`

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
