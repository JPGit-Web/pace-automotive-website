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
- ⬜ **13E+** — Preset/canned jobs for common services; horizontal estimate totals bar

**Phase 14 — Print, Document, and Detail Modal Workflow (owner-requested, planning only):**

These are larger than the Phase 13 incremental edits. They touch portal detail UI, printable document layouts, and estimate structure. Do not implement until Phase 13E+ is complete and the estimate/invoice data model is stable.

- ⬜ **14A — Detail View Modals**
  - RO, estimate, and invoice detail panels currently appear as large inline tiles below the list. Convert to centered modal/popup overlays.
  - Preserve all existing actions inside modals: edit, status changes, start inspection, create/view estimate, send approval, create Helcim invoice, etc.
  - Keep deep-link support where practical. No data loss on modal close.
  - Mobile/tablet behaviour must remain usable.

- ⬜ **14B — Printable Customer Invoice**
  - Add a Print button to invoice detail.
  - Build a professional letter-sized print layout matching the reference `invoice example.pdf`.
  - Include: shop header/contact, invoice number, RO number, service advisor (if available), date, customer, vehicle (year/make/model/VIN/plate/color/odometer if available).
  - Show grouped jobs/concerns, line items, notes per job, subtotal, GST, total, payment status, balance due.
  - Include authorization/signature area and warranty/legal text as approved by owners.
  - Use browser print CSS (`@media print`) or a dedicated print route — no third-party PDF library required for MVP.
  - **Internal cost and markup must never appear on the customer invoice printout.**
  - Customer approval page and print layout must stay token-protected.

- ⬜ **14C — Printable Internal Repair Order**
  - Add a Print Internal RO button to the RO detail panel (staff portal only).
  - Build a mechanic-facing print layout based on `DRAFT RO Internal.pdf` reference.
  - Auto-fill: customer name, date, year/make/model/trim, license plate, odometer, VIN, promised date.
  - Auto-fill numbered customer concerns from `repair_order_concerns`.
  - Include blank workspace areas for technician notes/findings.
  - Staff-only — never accessible to public or customer-facing routes.

- ⬜ **14D — RO Concerns to Estimate Job Groups**
  - When creating an estimate from a repair order, auto-pull active `repair_order_concerns` and create a grouped job section per concern.
  - Each concern becomes a named section/job header in the estimate builder.
  - Staff add notes, labour, parts, supplies, fees, and discounts under each concern.
  - Customer approval page and email show clearly grouped job sections.
  - Helcim invoice creation continues using final customer-facing prices only.
  - **May require a new `estimate_jobs` table** (or `estimate_items.estimate_job_id` / `repair_order_concern_id` column). Do not create schema until Phase 14D implementation begins and the current estimate model is reviewed.
  - Must not break existing approval workflow, invoice creation, or cost/markup isolation.

**Phase ordering recommendation:**
1. Complete Phase 13E+ (canned jobs, totals bar) if still planned.
2. Phase 14D (concern → job grouping) may need to connect with canned jobs and pricing — consider implementing after 13E+.
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
