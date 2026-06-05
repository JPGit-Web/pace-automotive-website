# P.A.C.E. Helcim Integration Plan

---

## 1. Overview

Helcim is P.A.C.E.'s payment processor and invoicing platform. It handles all financial transactions and customer-facing payment pages. The P.A.C.E. portal integrates with Helcim but never replaces it — Helcim remains the **source of truth for all payments and invoicing**.

---

## 2. Separation of Responsibilities

### What P.A.C.E. Portal Handles
| Responsibility | How |
|---|---|
| Repair order tracking | Internal database |
| Estimate creation and customer approval | Portal + email approval links |
| Linking a repair order to a Helcim invoice | Store Helcim invoice ID in `invoices` table |
| Displaying a payment link to staff | Retrieved from Helcim, stored in `invoices.helcim_payment_link` |
| Tracking payment status | Updated via Helcim webhook or manual staff confirmation |
| Recording which RO is paid | `repair_orders.payment_status` field |

### What Helcim Handles
| Responsibility | Notes |
|---|---|
| Invoice creation and numbering | Helcim generates official invoice number |
| Payment processing (card, tap, online) | Via HelcimPay.js or terminal |
| Card data storage and PCI compliance | Helcim is PCI-DSS compliant; P.A.C.E. never touches card data |
| Payment receipts | Helcim sends receipt emails to customers |
| Transaction history and reporting | View in Helcim dashboard |
| Refunds and voids | Processed in Helcim directly |

---

## 3. What P.A.C.E. Stores Locally

Only the minimum references needed to link records and display status:

| Field | Table | Notes |
|---|---|---|
| `helcim_invoice_id` | `invoices` | External Helcim invoice ID. Used to look up or link records |
| `helcim_invoice_number` | `invoices` | Human-readable number shown to staff (e.g. `INV-2024-0042`) |
| `helcim_payment_link` | `invoices` | The hosted payment URL. Staff shares this with customer if needed |
| `amount_due` | `invoices` | Total amount — copied from Helcim invoice for display |
| `amount_paid` | `invoices` | Updated by webhook or manual entry |
| `status` | `invoices` | `'unpaid'`, `'partial'`, `'paid'`, `'void'` |
| `paid_at` | `invoices` | Timestamp when payment confirmed |
| `helcim_invoice_id` | `repair_orders` | Quick reference on the RO record |
| `payment_status` | `repair_orders` | `'unpaid'`, `'partial'`, `'paid'` — summary field |

**Never stored locally:**
- Card numbers or PANs
- CVV / CVC codes
- Expiry dates
- Bank account numbers
- Full transaction records (view in Helcim)

---

## 4. Invoice Creation Options

### Option A — Manual Creation (MVP, Phase 1)
Staff creates the invoice in the Helcim dashboard manually, then pastes the Helcim invoice ID and payment link into the P.A.C.E. portal.

**Workflow:**
1. Repair order marked as `completed` in portal
2. Staff opens Helcim dashboard
3. Staff creates invoice in Helcim (customer, line items, total)
4. Staff copies Helcim invoice ID and payment link URL
5. Staff pastes both into the portal's invoice form for that RO
6. Portal stores the reference; staff shares payment link with customer

**Pros:** No API complexity, works immediately, zero risk of errors  
**Cons:** Manual step, potential for human error

### Option B — API-Based Invoice Creation (Future Phase)
Portal automatically creates a Helcim invoice via the Helcim REST API when staff clicks "Create Invoice."

**Workflow:**
1. Staff clicks "Create Helcim Invoice" in the portal for an RO
2. Netlify Function calls Helcim API with customer info + line items from the estimate
3. Helcim creates the invoice and returns an invoice ID + payment URL
4. Portal stores the returned ID and URL automatically

**Helcim API endpoint:** `POST /v1/invoices`  
**Required fields:** customer name, line items, amounts  
**Authentication:** Helcim API token (stored in Netlify environment variable)

**Pros:** Fewer manual steps, less chance of copy-paste errors  
**Cons:** Requires Helcim API access, mapping P.A.C.E. estimate items to Helcim format, handling API errors

---

## 5. Payment Link Options

### Option A — Helcim Hosted Payment Page (Recommended for MVP)
Helcim generates a unique payment URL per invoice. Staff shares this URL with the customer by email, text, or verbally.

- Customer visits the URL in their browser
- Helcim handles the entire checkout (card entry, processing, receipt)
- P.A.C.E. never sees the card

**URL format:** `https://myaccount.helcim.com/pay/{invoice-token}`

**Storage:** `invoices.helcim_payment_link`

### Option B — HelcimPay.js (Future Phase)
Embed a Helcim-hosted payment form directly in the customer approval page on powerautomotive.ca.

- Customer sees a payment form on the P.A.C.E. site after approving an estimate
- HelcimPay.js is loaded from Helcim's servers — no card data touches P.A.C.E.'s code
- On success, Helcim fires a JavaScript callback with a transaction token (not card data)

**Integration notes:**
- Add HelcimPay.js script tag to the approval page only
- Pass Helcim invoice ID to HelcimPay.js to pre-populate amount
- On success callback: call a Netlify Function to confirm and update `invoices.status`

---

## 6. Webhook Flow for Payment Confirmation

### Purpose
Automatically mark a repair order as paid when Helcim confirms a successful payment — without staff having to manually update the portal.

### Webhook Setup
1. In the Helcim dashboard: Settings → Webhooks → Add endpoint
2. Point to: `https://powerautomotive.ca/.netlify/functions/payment-event-sync`
3. Subscribe to: `invoice.paid`, `invoice.partial_payment`, `invoice.voided`
4. Helcim provides a **webhook secret** for signature verification

### Netlify Function: `payment-event-sync.js`

```
POST /.netlify/functions/payment-event-sync

1. Receive POST body from Helcim
2. Verify HMAC-SHA256 signature using HELCIM_WEBHOOK_SECRET
   → If invalid: return 401, stop processing
3. Parse event type from body
4. For 'invoice.paid':
   → Find invoice by helcim_invoice_id
   → Update invoices.status = 'paid', invoices.paid_at = now(), invoices.amount_paid = amount
   → Update repair_orders.payment_status = 'paid'
   → Insert row in activity_logs: action = 'invoice.paid', entity = invoice
5. For 'invoice.partial_payment':
   → Update invoices.status = 'partial', invoices.amount_paid = amount_paid
   → Update repair_orders.payment_status = 'partial'
6. For 'invoice.voided':
   → Update invoices.status = 'void'
7. Return 200 OK
```

**Important:** Always return `200 OK` to Helcim even if the record isn't found — returning errors causes Helcim to retry, which can cause duplicate processing.

---

## 7. Why Not Store Payment Details

### PCI DSS Compliance
If P.A.C.E.'s database ever stored card numbers, CVV, or expiry dates, the shop would be subject to full PCI DSS Level 1 audit requirements — expensive, complex, and high-liability.

By delegating all payment data to Helcim (a PCI-DSS compliant processor), P.A.C.E. operates under the simplest PCI scope (SAQ A) — the cardholder data never touches P.A.C.E.'s servers.

### Breach Risk
If P.A.C.E.'s Supabase database were ever compromised, no payment data would be exposed. Attackers would find only repair records, names, phone numbers, and email addresses — serious, but not a payment card breach.

---

## 8. Helcim API Reference

| Resource | Notes |
|---|---|
| API Docs | Available in Helcim dashboard under Developer |
| Base URL | `https://api.helcim.com/v2/` |
| Auth | API token in `Authorization: Bearer {token}` header |
| Sandbox | Helcim provides a test environment for development |
| Invoice endpoints | `GET /invoices`, `POST /invoices`, `GET /invoices/{id}` |
| Payment endpoints | Read-only from webhook; don't initiate payments via API for in-person |

---

## 9. Implementation Order

| Phase | Task |
|---|---|
| MVP | Manual: staff creates invoice in Helcim, pastes ID + link into portal |
| Phase 2 | Add Helcim webhook handler to auto-update payment status |
| Phase 3 | Add API-based invoice creation from portal (auto-populate from estimate) |
| Phase 4 | Explore HelcimPay.js on customer approval page for online payment |

---

## 10. P.A.C.E. Portal Phase 9 — Sub-Phase Breakdown

The portal's Helcim integration is split into four sequential sub-phases.

### Phase 9A — Database Setup (complete)

**Goal:** Create the database tables to track Helcim invoices, line item snapshots, and payment events.

**Migration file:** `supabase/migrations/006_helcim_invoices.sql`
**Service role grants:** `supabase/migrations/006b_helcim_service_role_grants.sql`

**Tables created:**
- `helcim_invoices` — one record per Helcim invoice linked to a repair order
- `helcim_invoice_items` — immutable snapshot of what was sent to Helcim
- `helcim_payment_events` — append-only log for webhook events and manual syncs

**What is NOT done yet:** No Helcim API calls, no webhooks, no frontend UI.

---

### Phase 9B — Staff Invoice Linking (Manual)

**Goal:** Staff can manually record a Helcim invoice against a completed repair order without leaving the portal.

**Frontend:** Update `src/pages/portal/PortalInvoices.jsx`

**Workflow:**
1. Staff completes a repair order and creates an invoice in the Helcim dashboard.
2. Staff returns to the portal Invoices page (or the RO detail).
3. Staff pastes the Helcim invoice ID, invoice number, and payment link URL.
4. Portal creates a `helcim_invoices` row and links it to the RO.
5. Staff shares the payment link with the customer (by email, text, or verbally).
6. Staff can manually mark as paid, partial, or voided.

**No API calls or webhooks in this phase.**

---

### Phase 9C — Helcim API Invoice Creation

**Goal:** Portal automatically creates a Helcim invoice via the Helcim REST API when staff clicks "Create Invoice."

**Netlify Function:** `netlify/functions/helcim-create-invoice.js`

**Environment variables required:**
```
HELCIM_API_TOKEN=your_helcim_api_token
HELCIM_API_BASE_URL=https://api.helcim.com/v2
```

**Workflow:**
1. Staff clicks "Create Invoice in Helcim" from the portal for a completed RO.
2. Netlify Function authenticates with Helcim API using `HELCIM_API_TOKEN`.
3. Function builds the invoice payload from the estimate items (approved line items).
4. Helcim creates the invoice and returns invoice ID, number, and payment URL.
5. Portal stores the returned values in `helcim_invoices`.
6. Staff sees the invoice number and payment link immediately in the portal.

**Helcim API endpoint:** `POST /v2/invoices`
**Authentication:** `Authorization: Bearer {HELCIM_API_TOKEN}` header

**Security notes:**
- `HELCIM_API_TOKEN` is stored in Netlify environment variables only.
- It must never appear in `src/` or any frontend code.
- The Netlify Function verifies the staff Supabase access token before calling Helcim.

---

### Phase 9D — Helcim Webhook Payment Sync (complete)

**Goal:** Payment status updates automatically when Helcim confirms a transaction, without staff having to manually update the portal.

**Netlify Function:** `netlify/functions/payment-event-sync.js`

**Endpoint:** `/.netlify/functions/payment-event-sync`

**Environment variables required:**
```
HELCIM_WEBHOOK_VERIFIER_TOKEN=your_helcim_webhook_verifier_token
HELCIM_API_TOKEN=your_helcim_api_token   (for fetching transaction details)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**⚠️ Important — Webhook Delivery URL:**
- The delivery URL must be HTTPS.
- Helcim may reject delivery URLs that contain the word "helcim".
  If rejected, use Netlify redirect rules to expose the function under a neutral path
  such as `/.netlify/functions/payment-event-sync` (rename the file accordingly).
- For local testing, you must use a tunneling tool such as ngrok or Cloudflare Tunnel —
  Helcim cannot deliver to `localhost`. A deployed Netlify preview URL also works.

**Helcim dashboard setup:**
1. Log in to Helcim → All Tools → Integrations → Webhooks
2. Add a new webhook endpoint
3. Set Delivery URL to: `https://powerautomotive.ca/.netlify/functions/payment-event-sync`
4. Copy the **Verifier Token** shown after creation
5. Add it to Netlify environment variables as `HELCIM_WEBHOOK_VERIFIER_TOKEN`
6. Select events to subscribe to (at minimum): `cardTransaction`

**Signature verification:**
- Helcim uses Svix for webhook delivery
- Signed content: `{webhook-id}.{webhook-timestamp}.{rawBody}`
- Key: base64-decoded `HELCIM_WEBHOOK_VERIFIER_TOKEN`
- Algorithm: HMAC-SHA256, result encoded as base64
- Compared against `webhook-signature` header using timing-safe comparison
- Returns 401 if verification fails

**Webhook event types handled:**
- `cardTransaction` — payment attempt; transaction details fetched via Helcim API
- `terminalCancel` — cancellation recorded but does not mark invoice paid
- Unknown types — recorded in `helcim_payment_events` and 200 returned safely

**Workflow:**
1. Customer pays via the Helcim payment link.
2. Helcim sends a POST to `/.netlify/functions/payment-event-sync`.
3. Function verifies the HMAC-SHA256 signature using `HELCIM_WEBHOOK_SECRET`.
   - If invalid: return 401, do not process.
4. Function matches the event to a `helcim_invoices` row via `helcim_invoice_id`.
5. Inserts a row into `helcim_payment_events` (append-only, includes sanitized payload).
6. Updates `helcim_invoices.payment_status` and `amount_paid_cents`.
7. Updates `repair_orders.payment_status` to match.
8. Logs to `activity_logs`.
9. Always returns `200 OK` — Helcim retries on non-200 responses, which can cause duplicate processing.

**Security notes:**
- `raw_payload` stored in `helcim_payment_events` must be sanitized before insert.
- Never store card numbers, CVV, expiry dates, or bank details in `raw_payload`.
- `HELCIM_WEBHOOK_SECRET` is stored in Netlify environment variables only.

---

## 11. Environment Variables Reference

| Variable | Used In | Notes |
|---|---|---|
| `HELCIM_API_TOKEN` | Netlify Functions only (`helcim-create-invoice.js`) | Never in `src/`. Set in Netlify env vars. |
| `HELCIM_WEBHOOK_VERIFIER_TOKEN` | Netlify Functions only (`payment-event-sync.js`) | Used to verify Svix/Helcim HMAC signatures. Never in `src/`. |
| `HELCIM_API_BASE_URL` | Netlify Functions only | Defaults to `https://api.helcim.com/v2`. Set explicitly for sandbox testing. |
