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

- ✅ **14D — RO Concerns to Estimate Job Groups**
  - When creating an estimate from a repair order, auto-pull active `repair_order_concerns` and create a grouped job section per concern.
  - Each concern becomes a named section/job header in the estimate builder.
  - Staff add notes, labour, parts, supplies, fees, and discounts under each concern.
  - Customer approval page and email show clearly grouped job sections.
  - Helcim invoice creation continues using final customer-facing prices only.
  - Implemented: `estimate_jobs` table + `estimate_job_id` on `estimate_items`; grouped estimate builder UI; grouped approval page; idempotent concern-to-job creation.
  - Must not break existing approval workflow, invoice creation, or cost/markup isolation.

- ✅ **14E — Dedicated Presets Page + Improved Job Group Removal**
  - Dedicated `/portal/presets` page (sidebar nav between Estimates and Invoices): full CRUD for preset jobs — create, edit, deactivate/reactivate; add/edit line items with staff-only cost/markup pricing. Two-column layout (job list + editor panel). No hard delete.
  - Preset picker in estimate builder gains a "Manage Presets →" footer link navigating to the Presets page.
  - Removing a job group from an estimate now correctly sets `estimate_job_id = null` on assigned items in the DB before soft-hiding the job (previously only updated the UI; items' DB link was left stale). Confirmation updated to "Remove this job group from the estimate? Existing line items will be moved to Ungrouped."
  - New portalData helpers: `ungroupEstimateJobItems`, `listAllCannedJobs`.
  - No schema migrations (all tables already existed).

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

- ✅ **15A — Percentage or Fixed Dollar Markup**
  - Staff can price line items using either percentage markup or fixed dollar markup.
  - Percent: `customer_price = cost × (1 + markup_percent / 100)` (e.g. $50 + 25% = $62.50).
  - Fixed: `customer_price = cost + markup_value_cents` (e.g. $50 + $20 = $70.00).
  - New columns: `markup_type` (check 'percent'|'fixed') and `markup_value_cents` on both `estimate_items` and `canned_job_items` (migration 012).
  - UI: Markup Type selector (Percent / Fixed $) replaces the single Markup (%) field; auto-calculation triggers correctly for both modes; customer price can still be manually overridden.
  - Applies in estimate builder Add/Edit Item modal, Manage Preset Jobs inline forms, and the dedicated Presets page.
  - `addCannedJobToEstimate` copies `markup_type` and `markup_value_cents` from preset to estimate.
  - Internal pricing fields only — no change to any customer-facing output, approval email, invoice print, or Helcim invoice creation.

- ✅ **15B — Sidebar / Portal UX Cleanup**
  - Presets moved out of the main menu; now lives in a "Setup" section at the bottom of the sidebar.
  - Active-state highlighting works on the bottom Presets link (same `portalNavLink.active` class as main menu).
  - Stale phase text removed. Footer shows "P.A.C.E. Portal" version tag below the Presets link.
  - No route, schema, or pricing changes.

- ✅ **15C — Owner-Ready Cleanup / QA**
  - Removed the only production-facing phase label: "Phase 9D" span on the Invoices Sync button; updated tooltip to reflect that webhook auto-sync is active.
  - Full security audit: no secrets in `src/`, no Supabase `.delete()` calls, all four customer-facing Netlify functions confirmed to exclude internal pricing fields via explicit column allowlists.
  - `docs/TEST_DATA_CLEANUP.sql` — manual SQL script for Supabase Dashboard to soft-delete test customers and all linked records (in dependency order), with SELECT preview queries and safety ROLLBACK.
  - `docs/OWNER_DEMO_CHECKLIST.md` — 14-section end-to-end QA checklist covering auth, all portal pages, estimate pricing modes, customer approval safety, invoice print, Presets page, and security verification.

- ✅ **16A — Appointment Calendar**
  - Month calendar view on the Appointments page (default); List view still available via toggle.
  - Appointments placed by submission date (`created_at`) — `preferred_date` is free text and not parseable. Nav bar shows "Shown by submission date" note. Future `scheduled_date` column would enable proper placement.
  - Status colour coding: pending = amber, confirmed = blue, converted = green, cancelled = gray strikethrough.
  - Clicking an event opens the shared detail panel (status change, Convert to RO).
  - 60-second auto-refresh interval. Loading/error/empty states in the calendar container.
  - Pure React, no external calendar library. Responsive — compact layout below 640 px.
  - No schema changes.

**Owner & Staff User Manual:**
- `docs/OWNER_USER_MANUAL.md` created — 20-section non-technical guide written for shop owners, front desk staff, and technicians. Covers every portal page, recommended daily workflow, common scenarios, troubleshooting, what not to do, and a quick reference cheat sheet. Suitable for distribution directly to owners.
- `docs/OWNER_QUICK_START.md` created — 1–2 page companion quick-start guide covering login, daily workflow table, main pages, RO creation, estimate/invoice flow, presets, safety rules, and quick troubleshooting. Designed to be sent alongside the full manual as an at-a-glance reference.

- ✅ **17B — 4-Digit PIN Portal Login**
  - Staff log in with a staff username (`paceadmin`) or email address + a 4-digit PIN instead of a full password.
  - New Netlify Function `portal-pin-login.js`: validates PIN by computing `sha256(PORTAL_LOGIN_PIN_SALT + ":" + pin)` and comparing to `PORTAL_LOGIN_PIN_HASH` via `timingSafeEqual`. Raw PIN is never stored — only a salted hash. This avoids Netlify secret scanning false positives. Then exchanges for real Supabase session tokens using `PORTAL_ADMIN_EMAIL` + `PORTAL_ADMIN_PASSWORD` (both server-side env vars, never in `src/`).
  - Frontend receives `{ access_token, refresh_token }` and calls `supabase.auth.setSession()` — establishing a real Supabase session. All existing route protection, sign-out, and inactivity auto-sign-out remain unchanged.
  - All validation failures return the same generic error message (no enumeration of which field failed).
  - `PORTAL_ADMIN_PASSWORD` is never sent to the browser.

- ✅ **17A — Appointment Scheduling Workflow**
  - Calendar now shows only appointments with a confirmed scheduled date (`scheduled_start`). Unscheduled web form requests do NOT appear on the calendar.
  - Incoming requests remain in a list/table below the calendar until staff schedules and confirms them.
  - Detail modal: staff can save scheduling details (date, time, end time, service), confirm the appointment (adds it to the calendar), send a reply email to the customer, and change status (Pending / Processing / Confirmed / Cancelled).
  - `processing` status added (staff has replied / is actively handling the request).
  - Reply email sent via new `send-appointment-reply` Netlify Function (Resend). No email = phone-reply notice, no crash.
  - Migration 013: adds `scheduled_start/end/service`, `reply_message`, `replied_at`, `confirmed_at`, `cancelled_at` to `appointment_requests`. Status constraint updated to include `processing`.
  - No Google Calendar sync. No SMS. No drag-to-reschedule. No PIN login changes.

- ✅ **16C — In-Portal Help / Instructions Page**
  - `/portal/help` route added; Help link in sidebar footer (Setup section, below Presets).
  - `src/pages/portal/PortalHelp.jsx` — 14-section accordion staff reference (daily workflow card + Troubleshooting, Pricing & Markup, What Not To Do, and 10 other sections).
  - Accordion uses native `<details>`/`<summary>` — no JS state required.
  - Pricing & Markup section includes a safety callout confirming cost/markup is never customer-visible.
  - Static content only — no Supabase queries, no secrets, no customer-facing changes.

**Phase 16B / future — deferred:**
- Google Calendar sync — pending owner confirmation.
- SMS appointment reminders — pending provider decision.
- `scheduled_date` / `scheduled_start` / `scheduled_end` columns on `appointment_requests` — pending owner schema approval.
- Week / day calendar views.
- Drag-to-reschedule (requires `scheduled_date` first).

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
