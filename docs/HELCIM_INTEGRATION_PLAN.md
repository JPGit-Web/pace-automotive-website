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
2. Point to: `https://powerautomotive.ca/.netlify/functions/helcim-webhook`
3. Subscribe to: `invoice.paid`, `invoice.partial_payment`, `invoice.voided`
4. Helcim provides a **webhook secret** for signature verification

### Netlify Function: `helcim-webhook.js`

```
POST /.netlify/functions/helcim-webhook

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
