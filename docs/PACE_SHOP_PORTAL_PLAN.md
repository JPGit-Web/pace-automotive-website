# P.A.C.E. Shop Portal — Master Plan

## 1. Current Project Overview

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 7 |
| Styling | Custom CSS (`src/index.css`) |
| Hosting | Netlify (static site + serverless functions) |
| Email | Resend API via Netlify Function |
| Domain | powerautomotive.ca |

### Current File Structure
```
pace-site/
├── public/                    # Static assets (images, textures, favicon)
│   ├── pace-logo.png
│   ├── paceshop.png
│   ├── paper.png / paper2.png / grain.png
│   └── vite.svg
├── src/
│   ├── App.jsx                # Main single-page app (public website)
│   ├── index.css              # Global stylesheet
│   ├── main.jsx               # React entry point
│   └── components/
│       ├── Navbar.jsx         # Public site navigation
│       ├── Section.jsx        # Reusable section wrapper
│       ├── BookingForm.jsx    # Public appointment request form
│       └── Footer.jsx         # Public site footer
├── netlify/
│   └── functions/
│       └── send-inquiry.js    # Serverless email handler (Resend)
├── netlify.toml               # Netlify build + dev config
├── index.html                 # HTML entry point
├── package.json
├── vite.config.js
└── docs/                      # Planning documentation (this folder)
```

### Files That Must Not Be Broken
- `src/App.jsx` — Public website, do not restructure
- `src/index.css` — Public site styles, portal styles go in a separate file
- `src/components/BookingForm.jsx` — Live public form connected to Resend
- `netlify/functions/send-inquiry.js` — Live email function
- `netlify.toml` — Routing and build config (changes require care)
- `public/` — Static assets referenced by the live site

### Do Not Edit
- `node_modules/`
- `dist/`
- `.netlify/`

---

## 2. Recommended Future Architecture

### URL Structure
| Path | Purpose | Access |
|---|---|---|
| `/` | Public website (homepage, about, services, contact) | Public |
| `/approve/:token` | Customer approval links (estimates, inspections) | Token-secured, no login |
| `/portal` | Staff portal login page | Public page, redirects if already logged in |
| `/portal/dashboard` | Staff dashboard | Authenticated staff only |
| `/portal/customers` | Customer list and records | Authenticated staff only |
| `/portal/vehicles` | Vehicle records | Authenticated staff only |
| `/portal/appointments` | Appointment requests | Authenticated staff only |
| `/portal/repair-orders` | Repair order management | Authenticated staff only |
| `/portal/inspections/:id` | Digital inspection | Authenticated staff only |
| `/portal/estimates/:id` | Estimate builder | Authenticated staff only |
| `/portal/invoices` | Invoice list + Helcim links | Authenticated staff only |

### Routing Strategy
- Add **React Router v6** to handle `/`, `/portal/*`, and `/approve/:token`
- The current `App.jsx` single-page content moves into a `PublicSite` component
- A new `Portal` component tree handles all `/portal/*` routes
- A `ProtectedRoute` wrapper redirects unauthenticated users to `/portal` (login)
- `netlify.toml` SPA fallback already handles client-side routing

### Backend Strategy
| Concern | Solution |
|---|---|
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (email/password, JWT) |
| Private file storage | Supabase Storage with RLS policies |
| Secure backend actions | Netlify Functions (for things that must not touch the frontend) |
| Email (approval links, notifications) | Resend API (already configured) |
| Payments / Invoicing | Helcim (external, never store card data) |

### Why Supabase
- Managed PostgreSQL with Row Level Security (RLS)
- Built-in auth with JWT tokens, session management, and refresh
- Storage buckets with per-file access policies — perfect for private inspection photos
- Real-time subscriptions available for future dashboard live-updates
- Generous free tier; scales cleanly
- Works well with Netlify Functions for secure server-side operations

---

## 3. MVP Feature Scope

### Phase 1 MVP (Version 1)
The goal of Version 1 is a working, secure internal tool that replaces paper and spreadsheets for core shop workflows.

| Feature | Description |
|---|---|
| **Staff Login** | Single secure shop login (email + password). One account for now. |
| **Dashboard** | Summary of open ROs, pending approvals, today's appointments |
| **Customers** | Create, view, edit customer records with preferred contact method |
| **Vehicles** | Attach vehicles to customers, track year/make/model/VIN/plate |
| **Appointment Requests** | View and manage requests from the public booking form; convert to RO |
| **Repair Orders** | Create and manage repair orders with status tracking |
| **Digital Inspections** | Add inspection items by category, condition rating, notes, and photos |
| **Estimates** | Build estimates with labor and parts line items |
| **Customer Approval Links** | Send secure email link for customers to approve estimates |
| **Inspection Viewer** | Customers view inspection photos via secure token link |
| **Helcim Invoice Link** | Record Helcim invoice ID and payment link against each RO |
| **Payment Status** | Manually track or webhook-update payment status per RO |
| **Activity Log** | Internal log of key actions for accountability |

### Deferred to Future Phases

**Phase 12 — SMS Approval Links (Deferred — pending owner/provider decision):**
- SMS/text approval links (Twilio or similar, CASL-compliant)
- Owners have not confirmed SMS provider or whether they want to invest in SMS notifications
- Do not implement until owner approves

**Phase 13 — Post-MVP Workflow Improvements (owner-requested):**
- ✅ **13A** — Staff portal logo upgrade, full-width layout, inactivity auto sign-out, password visibility toggle
- ✅ **13B** — Inline new customer + inline new vehicle inside RO intake; multiple concerns per repair order (`repair_order_concerns` table)
- ✅ **13C** — Customer and vehicle service history view (read-only consolidated view of all ROs, concerns, inspections, estimates, invoices per customer or vehicle; compact history strip on RO detail panel)
- ✅ **13D** — Estimate line item internal pricing: staff-only cost_cents, markup_percent, and customer_unit_price_cents columns; auto-calculation in Add/Edit Item modal; cost/markup never exposed to customer-facing pages, emails, or functions
- ✅ **13E** — Canned jobs / preset job bundles: `canned_jobs` + `canned_job_items` tables; "Add Preset Job" picker modal with preview; "Manage Preset Jobs" panel; `addCannedJobToEstimate` helper; cost/markup never exposed to any customer-facing path
- ✅ **13F** — Horizontal estimate totals bar: full-width navy bar showing Subtotal / GST / Total (and Approved if applicable) in a single horizontal row; replaces the vertical totals box; Customer Actions card moved below as a full-width row of buttons

**Phase 14 — Print, Document, and Detail Modal Workflow (owner-requested, planning only):**

These are larger than the Phase 13 incremental edits. They touch portal detail UI, printable document layouts, and estimate structure. Do not implement until Phase 13F is complete and the estimate/invoice data model is stable.

- ✅ **14A — Detail View Modals and Modal Sizing**
  - RO and invoice detail panels converted from inline tiles to centered `portalModalOverlay` + `portalModalCard portalModalLg` modals. Click-outside-to-close on both.
  - Estimate builder was already a dedicated full-page view — no modal conversion needed.
  - `.portalModalLg` class added: `max-width: min(1100px, 92vw); max-height: 90vh`.
  - Manage Preset Jobs modal enlarged: `max-width: min(1100px, 94vw)`, layout height `min(520px, 60vh)`.
  - All existing actions (edit, status changes, inspection, estimate, approval, invoice, payment) preserved inside modals.
  - Scrolling is internal to the modal content area — page behind does not scroll.

- ✅ **14B — Printable Customer Invoice**
  - Print button added to invoice detail modal (next to Edit).
  - `InvoicePrintView.jsx` — self-contained print component rendered hidden on screen, revealed by `@media print`.
  - Layout: shop header (P.A.C.E. / Power Automotive Centre of Excellence, address, phone, email, website), invoice meta (number, RO, dates, payment status), Bill To (customer), vehicle (year/make/model/trim/colour/VIN/plate/odometer), customer concerns, line items table, totals (subtotal/GST/total/paid/balance due), notes, signature block, legal text.
  - Line items use `helcim_invoice_items`; fall back to `estimate_items` (customer-safe columns only) if invoice items are empty.
  - `cost_cents`, `markup_percent`, `customer_unit_price_cents`, and RO `internal_notes` never appear in the printout.
  - Print is rendered only inside the authenticated staff portal — no public URL.

- ✅ **14C — Printable Internal Repair Order**
  - Print Internal RO button added to RO detail modal linked-actions row (staff portal only).
  - `InternalROPrintView.jsx` — auto-fills: customer name, date, year/make/model/trim, license plate, odometer (in+out), VIN, promised date, numbered concerns.
  - Matches DRAFT RO Internal.pdf style: bordered info grid, numbered concern slots with write lines, QTY/DESCRIPTION materials table, lined technician notes area, signature block.
  - Falls back to legacy `customer_concern` text if `repair_order_concerns` is empty.
  - `getRepairOrder` updated: vehicle now includes `vin` and `trim`.
  - Staff-only — rendered inside `ProtectedRoute`. No public URL. `internal_notes` not printed.

- ⬜ **14D — RO Concerns to Estimate Job Groups**
  - When creating an estimate from a repair order, auto-pull active `repair_order_concerns` and create a grouped job section per concern.
  - Each concern becomes a named section/job header in the estimate builder.
  - Staff add notes, labour, parts, supplies, fees, and discounts under each concern.
  - Customer approval page and email show clearly grouped job sections.
  - Helcim invoice creation continues using final customer-facing prices only.
  - **May require a new `estimate_jobs` table** (or `estimate_items.estimate_job_id` / `repair_order_concern_id` column). Do not create schema until Phase 14D implementation begins and the current estimate model is reviewed.
  - Must not break existing approval workflow, invoice creation, or cost/markup isolation.

**Phase ordering recommendation:**
1. Complete Phase 13F (horizontal estimate totals bar) if still planned.
2. Phase 14D (concern → job grouping) may need to connect with canned jobs and pricing — consider implementing after 13F.
3. Phase 14B/14C print layouts are best implemented after the estimate/invoice structure is stable (i.e., after 14D).
4. Phase 14A (detail modals) can be done independently of 14B–14D.

**Longer-term backlog:**
- Multiple staff accounts / role-based permissions
- Automatic Helcim invoice creation via API
- Technician time tracking
- Parts ordering integration
- Customer portal (login-based, not token-based)
- Reporting and analytics dashboard
- Mobile app

---

## 4. Key Design Decisions

### One Login for MVP
Supabase Auth will be set up with a single staff email/password. The `staff_users` table will be ready for multiple accounts and roles, but only one account will be active in V1. Role-based access control (RBAC) is planned in the schema but not enforced until V2.

### Customer Approval Links (Email First)
Approval tokens are single-use UUIDs stored in the database with an expiry. The customer receives an email (via Resend) with a link like:
```
https://powerautomotive.ca/approve/a3f9b2c1-...
```
No login required. The token grants view access to one specific estimate or inspection. Tokens expire after 7 days by default. SMS approval is a planned future addition — the customer record stores preferred contact method to make this transition easier.

### Inspection Photo Privacy
Photos are stored in a **private Supabase Storage bucket**. They are never publicly accessible by URL. Staff access photos via authenticated requests. Customers access photos only via signed URLs generated server-side when they load a valid approval token link. Signed URLs expire after a short window (e.g. 1 hour).

### Helcim Boundary
P.A.C.E.'s database stores only the Helcim invoice ID and payment link URL. All payment processing, card data, and transaction records stay in Helcim. The portal links out to Helcim's hosted payment page or embeds HelcimPay.js for in-person terminal use.
