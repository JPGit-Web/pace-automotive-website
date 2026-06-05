# P.A.C.E. Shop Portal — Build Phases

Each phase is designed to be self-contained and deployable. The public website is never broken between phases.

---

## Phase 0 — Planning (Complete)
**Goal:** Documentation before a single line of implementation code is written.

- [x] `docs/PACE_SHOP_PORTAL_PLAN.md`
- [x] `docs/DATABASE_SCHEMA.md`
- [x] `docs/SECURITY_PLAN.md`
- [x] `docs/HELCIM_INTEGRATION_PLAN.md`
- [x] `docs/BUILD_PHASES.md`

**Rules:** No code changes. No dependency installs. No styling changes.

---

## Phase 1 — Routing Foundation
**Goal:** Add React Router to the project so the public site lives at `/` and the portal can live at `/portal/*`. Public site must look and work identically after this phase.

### Tasks
- Install `react-router-dom` v6
- Create `src/config.js` for shared constants (Tekmetric URL, etc.)
- Wrap `src/main.jsx` with `<BrowserRouter>`
- Create `src/router.jsx` defining all routes
- Move current `App.jsx` content into `src/pages/PublicSite.jsx` (no changes to the JSX itself)
- Create `src/pages/portal/PortalLogin.jsx` — empty placeholder page
- Create `src/pages/portal/PortalDashboard.jsx` — empty placeholder page
- Create `src/pages/ApprovalPage.jsx` — empty placeholder for `/approve/:token`
- Create `src/components/portal/ProtectedRoute.jsx` — always redirects to login for now
- Update `src/App.jsx` to render `<RouterProvider>` or equivalent
- Update `netlify.toml` SPA fallback is already in place — verify it covers `/portal/*`

### Verification
- [ ] Public site at `/` looks and works exactly as before
- [ ] Navigating to `/portal` shows the placeholder login page
- [ ] Navigating to `/portal/dashboard` redirects to `/portal` (not logged in)
- [ ] No console errors on the public site

### Files Changed
- `src/main.jsx`
- `src/App.jsx` (becomes router shell)
- `src/pages/PublicSite.jsx` (new — contains old App content)
- `src/pages/portal/PortalLogin.jsx` (new)
- `src/pages/portal/PortalDashboard.jsx` (new)
- `src/pages/ApprovalPage.jsx` (new)
- `src/components/portal/ProtectedRoute.jsx` (new)
- `package.json` (react-router-dom added)

---

## Phase 2 — Portal UI Shell
**Goal:** Build the portal's visual structure — sidebar navigation, layout, and a set of placeholder pages. No real data yet.

### Tasks
- Create `src/styles/portal.css` — portal-specific styles (completely separate from `index.css`)
- Design and build `src/components/portal/PortalLayout.jsx` — sidebar + main content area
- Build sidebar with navigation links to all portal sections
- Create placeholder pages (no data, just headings + "coming soon"):
  - `/portal/dashboard`
  - `/portal/customers`
  - `/portal/vehicles`
  - `/portal/appointments`
  - `/portal/repair-orders`
  - `/portal/inspections`
  - `/portal/estimates`
  - `/portal/invoices`
- Style the portal independently from the public site (dark professional theme or clean light theme — decision needed)
- Portal should be clearly a different visual context from the public website

### Verification
- [ ] Public site unchanged
- [ ] All portal routes render their placeholder pages within the sidebar layout
- [ ] Portal CSS does not bleed into the public site
- [ ] Portal navigation links work

### Files Changed / Created
- `src/styles/portal.css` (new)
- `src/components/portal/PortalLayout.jsx` (new)
- `src/components/portal/PortalSidebar.jsx` (new)
- `src/pages/portal/*.jsx` (all placeholder pages)

---

## Phase 3 — Supabase Setup + Real Authentication
**Goal:** Connect Supabase, set up the database, and implement real staff login.

### Tasks

**Supabase Setup:**
- Create Supabase project (powerautomotive or similar)
- Install `@supabase/supabase-js`
- Create `src/lib/supabase.js` — Supabase client using `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- Add env vars to Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Create `.env.local` for local development (gitignored)

**Database:**
- Run `staff_users` table migration in Supabase SQL editor
- Enable RLS on `staff_users`
- Create the one staff account in Supabase Auth dashboard
- Insert corresponding row in `staff_users`

**Auth in Portal:**
- Build real `PortalLogin.jsx` with email/password form
- On submit: call `supabase.auth.signInWithPassword()`
- On success: redirect to `/portal/dashboard`
- On error: show error message (generic — do not say "wrong password" vs "user not found")
- Update `ProtectedRoute` to check real Supabase session
- Build logout button in sidebar: calls `supabase.auth.signOut()` + redirect to `/portal`
- Persist session across page refresh (Supabase client handles this automatically)

### Verification
- [ ] Login with correct credentials → dashboard
- [ ] Login with wrong credentials → error message
- [ ] Accessing `/portal/dashboard` without login → redirect to `/portal`
- [ ] Logout → redirect to `/portal`, session cleared
- [ ] Refreshing portal page while logged in → stays logged in
- [ ] Public site unchanged

---

## Phase 4 — Customers and Vehicles
**Goal:** Staff can create, view, search, and edit customer records and their vehicles.

### Tasks

**Database:**
- Run `customers` table migration
- Run `vehicles` table migration
- Enable RLS on both; add staff read/write policies
- Enable `updated_at` trigger (moddatetime extension)

**Portal Features:**
- Customer list page with search by name, phone, email
- Customer detail page: info, preferred contact, notes, vehicles list
- Add/edit customer form
- Add/edit vehicle form (within customer record)
- Soft delete (is_active = false) — no hard deletes

**Activity Logging:**
- Run `activity_logs` table migration
- Log: `customer.created`, `customer.updated`, `vehicle.created`, `vehicle.updated`

### Verification
- [ ] Create a customer and see them in the list
- [ ] Edit customer details
- [ ] Add a vehicle to a customer
- [ ] Search for customer by name
- [ ] Soft-deleted customer not shown in main list (add toggle for "show inactive")

---

## Phase 5 — Appointment Requests
**Goal:** Appointment requests from the public form appear in the portal. Staff can view, manage, and convert them to repair orders.

### Tasks

**Database:**
- Run `appointment_requests` table migration
- Enable RLS; staff policies

**Netlify Function Update:**
- Modify `send-inquiry.js` to also write the appointment request to Supabase (using service role key) in addition to sending the email
- Store: name, phone, email, vehicle_info, service_requested, preferred_date, notes, source = 'web_form'

**Portal Features:**
- Appointment requests list page with status filter (pending, confirmed, etc.)
- Appointment detail view
- Status update (pending → confirmed → cancelled)
- "Convert to Repair Order" button — creates a draft RO, prompts staff to link/create customer and vehicle records, sets `appointment_requests.repair_order_id`

### Verification
- [ ] Submit public booking form → appears in portal appointment list
- [ ] Phone/walk-in requests can be manually entered in portal
- [ ] Convert appointment to repair order → draft RO created, appointment marked converted

---

## Phase 6 — Repair Orders
**Goal:** Staff can create and manage repair orders through their full lifecycle.

### Tasks

**Database:**
- Run `repair_orders` table migration
- Enable RLS; staff policies
- Add RO number auto-generation (Postgres sequence or trigger)

**Portal Features:**
- Repair order list with status filter
- Repair order detail page
- Create new RO (select customer + vehicle, fill in concern)
- Status workflow buttons (active → waiting approval → approved → in_progress → completed)
- Mileage in/out fields
- Internal notes, customer concern, cause, correction fields
- Link to appointment request (if applicable)
- View linked inspection, estimate, invoice from RO detail page

### Verification
- [ ] Create a repair order with customer and vehicle
- [ ] Progress RO through status stages
- [ ] RO list filterable by status

---

## Phase 7 — Digital Inspections + Private Photos
**Goal:** Staff can complete a digital vehicle inspection with photos. Inspection is viewable by customer via secure token link.

### Tasks

**Database:**
- Run `inspections`, `inspection_items`, `inspection_photos` migrations
- Enable RLS on all three tables
- Inspection auto-created when RO moves to `active` status (or manually triggered)

**Supabase Storage:**
- Create private bucket: `inspection-photos`
- Configure bucket RLS: authenticated staff can upload/read; anon access denied

**Portal Features:**
- Inspection form within RO detail page
- Add inspection items by category
- Set condition: good / fair / needs attention / urgent
- Add notes per item
- Upload photos per item (from device camera or file picker)
- Visual summary: color-coded by condition
- Mark inspection complete

**Customer Approval Function (Inspection View):**
- Netlify Function: `get-inspection.js`
  - Validates approval token (type = `inspection_view`)
  - Returns inspection items and generates signed photo URLs (1-hour expiry)
- Build `ApprovalPage.jsx` — renders inspection results without login
- Token generation: staff clicks "Share Inspection" → portal calls a Netlify Function to create token → Resend sends email to customer with link

### Verification
- [ ] Upload photos to an inspection item
- [ ] Photos visible to staff in portal
- [ ] Share inspection → customer receives email with link
- [ ] Customer visits link → sees inspection with photos (no login)
- [ ] Visiting link after expiry → shows "link expired" message
- [ ] Photo URLs from customer view are time-limited signed URLs, not permanent

---

## Phase 8 — Estimates + Customer Approval Links
**Goal:** Staff can build estimates and send them to customers for approval by email.

### Tasks

**Database:**
- Run `estimates`, `estimate_items`, `approval_tokens` migrations
- Enable RLS

**Portal Features:**
- Estimate builder within RO detail
- Add line items: labor, parts, sublet, fee, discount
- Auto-calculate subtotal, GST (5%), total
- Versioning: each revision creates a new estimate row
- "Send for Approval" button → triggers Netlify Function

**Netlify Function: `send-approval.js`**
- Validates staff session (service role)
- Creates `approval_tokens` row (type = `estimate_approval`, 7-day expiry)
- Sends email via Resend with approval link
- Updates `estimates.status = 'sent'`, `estimates.sent_at`

**Customer Approval Page (`/approve/:token`):**
- Netlify Function: `get-approval.js` — validates token, returns estimate data
- Renders: line items, total, accept/decline buttons
- "Approve" action:
  - Netlify Function: `submit-approval.js`
  - Marks token `used_at`
  - Updates `estimates.status = 'approved'`
  - Updates `repair_orders.status = 'approved'`
  - Logs to `activity_logs`
  - Sends confirmation email to customer + notification to staff
- "Decline" action: marks estimate declined, notifies staff

### Verification
- [ ] Build estimate with multiple line items
- [ ] Tax calculated correctly (5% GST)
- [ ] Send estimate → customer receives email
- [ ] Customer approves → portal shows approved status
- [ ] Customer declines → portal shows declined status
- [ ] Expired token → customer sees appropriate message
- [ ] Revoked token → customer sees appropriate message

---

## Phase 9 — Helcim Invoice Integration (Manual)
**Goal:** Staff can record a Helcim invoice against a completed repair order and track payment status.

### Tasks

**Database:**
- Run `invoices` migration
- Enable RLS

**Portal Features:**
- Invoice section on RO detail page (visible once RO is `completed`)
- Form to enter: Helcim invoice ID, Helcim invoice number, payment link URL, amount due
- Display current payment status (unpaid / partial / paid)
- Manual "Mark as Paid" button for cash or terminal payments confirmed in person
- Link to Helcim payment URL (opens in new tab)

### Verification
- [ ] Enter Helcim invoice ID and link against a completed RO
- [ ] Payment status updates manually
- [ ] Payment link opens Helcim hosted payment page

---

## Phase 10 — Helcim Webhook (Automatic Payment Status)
**Goal:** Payment status updates automatically when Helcim confirms a transaction.

### Tasks
- Create Netlify Function: `helcim-webhook.js`
- Add `HELCIM_WEBHOOK_SECRET` to Netlify env vars
- Implement HMAC signature verification
- Handle `invoice.paid`, `invoice.partial_payment`, `invoice.voided` events
- Update `invoices` and `repair_orders` tables accordingly
- Log to `activity_logs`
- Configure webhook endpoint in Helcim dashboard

### Verification
- [ ] Simulate Helcim webhook with correct signature → status updates
- [ ] Simulate with incorrect signature → 401, no database changes
- [ ] Duplicate webhook delivery → idempotent (no double-update)

---

## Phase 11 — Dashboard + Reporting
**Goal:** Give the portal a useful at-a-glance dashboard.

### Tasks
- Today's appointments and open repair orders
- ROs awaiting customer approval
- ROs completed but not invoiced
- Unpaid invoices summary
- Recent activity feed
- Quick-create buttons: new customer, new RO, new appointment

### Verification
- [ ] Dashboard counts match actual database records
- [ ] Clicking a count navigates to the filtered list

---

## Phase 12 — SMS Approval Links (Future)
**Goal:** Send approval links and notifications via text message in addition to email.

### Decisions Needed Before This Phase
- SMS provider: Twilio, AWS SNS, or Vonage
- Opt-in/consent workflow for customers
- Canadian CASL compliance for commercial SMS

### High-Level Tasks
- Add SMS provider credentials to Netlify env vars
- Update `send-approval.js` to send SMS when `preferred_contact` includes text
- Update customer form to collect and verify phone for SMS
- Add CASL-compliant opt-in confirmation step

---

## Phase 13 — Post-MVP Workflow Improvements and Shop Usability Edits
**Goal:** Owner-requested workflow improvements to make the portal more practical for daily shop use after the core MVP is complete. These items were identified during the build process as quality-of-life improvements that would significantly reduce friction but are not required for the initial go-live.

**Dependencies:** This phase should begin only after Phases 9–11 are complete:
- Core repair order workflow fully operational
- Inspections and estimates in daily use
- Helcim invoice linking in place
- Dashboard/reporting connected to live data
- Production security review completed

---

### A. New Customer Flow Inside New Repair Order

**Problem:** Staff currently must leave the Repair Orders page, go to Customers to create a new customer and vehicle, then return to create the RO. This back-and-forth is disruptive mid-job.

**Planned solution:**
- Add a "New Customer" button inside the New Repair Order modal.
- When clicked, open an inline or step-over sub-form to create a customer name, phone, and email.
- After saving the new customer, optionally prompt to add a vehicle for that customer.
- After vehicle is created, return to the RO modal with customer + vehicle pre-selected.
- The full customer record should be saved to the `customers` table normally.

**Design notes:**
- Can be implemented as a multi-step modal (step 1: select or create customer, step 2: select or create vehicle, step 3: RO details).
- Alternatively: an expandable "Create new customer" section that appears inside the existing dropdown.
- No new tables required — uses existing `customers` and `vehicles`.

---

### B. Multiple Customer Concerns per Repair Order

**Problem:** The single "Customer Concern" textarea on a repair order is inadequate when a customer drops off a vehicle with several unrelated issues. All concerns get mixed into one text block, making the RO harder to read and track.

**Planned solution:**
- Replace or augment the single `customer_concern` textarea with a list-style input.
- Staff can add multiple labeled concern entries, e.g.:
  - Concern 1: "Engine noise on startup"
  - Concern 2: "Check engine light on"
  - Concern 3: "Brakes squeaking at low speed"
- Each concern can later be individually connected to inspection items, estimate line items, or cause/correction fields.

**Design notes — two approaches:**
1. **JSON/text in existing column**: Store as a JSON array in `customer_concern` (e.g., `["Engine noise", "CEL on"]`). No schema change. Simpler but less queryable.
2. **New table `repair_order_concerns`**: A separate table with `repair_order_id`, `sort_order`, `description`, `cause`, `correction`. More structured, better for future linking to inspections/estimates. Preferred if time allows.

**Future potential:** Each concern row could later link directly to inspection items and estimate line items, enabling full 3-C (concern/cause/correction) traceability per issue.

---

### C. Customer Service and Vehicle History View

**Problem:** Staff currently have no consolidated view of a customer's or vehicle's history. To understand what work has been done, they must navigate to individual repair orders, inspections, and estimates separately.

**Planned solution:**
- Add a "History" tab or expandable section on the Customer detail page showing:
  - All past repair orders (RO number, date, status, total)
  - All vehicles on file
  - All inspections linked to those ROs
  - All estimates and their approval status
  - All invoices and payment status
  - Internal notes and visit dates
- Add a similar history section to the Vehicle detail page.
- Staff should be able to see at a glance: "This vehicle has been in 4 times, last for brakes."

**Design notes:**
- No new tables required. This is a query/display problem using existing `repair_orders`, `inspections`, `estimates`, and `invoices` tables filtered by `customer_id` or `vehicle_id`.
- Could be rendered as a timeline or simple sorted list.
- Consider adding a "total lifetime value" summary (sum of paid invoices per customer).

---

### D. Line Item Cost, Markup, and Customer Price

**Problem:** The current estimate line item only has a customer-facing unit price. Staff cannot track internal cost or markup, making it impossible to calculate profitability from within the portal.

**Planned solution:**
- Add optional cost and markup fields to estimate line items:
  - `cost_cents` — internal cost price (not shown to customer)
  - `markup_percent` — markup applied to cost (e.g., 30%)
  - `customer_price_cents` — final customer-facing price (auto-calculated from cost + markup, but editable)
- The customer approval page should never show cost or markup — only the customer price.
- Staff see all three fields in the estimate builder.

**Potential schema change to `estimate_items`:**
```sql
cost_cents          integer null,   -- internal cost, never shown to customer
markup_percent      numeric(5,2) null,  -- e.g. 30.00 for 30%
-- unit_price_cents becomes the customer-facing price (already exists)
```

**Design notes:**
- These are optional fields — existing estimates without cost/markup still work.
- Profitability reports could be built in Phase 11 using these fields.
- Do not expose `cost_cents` or `markup_percent` in any customer-facing function or approval page.

---

### E. Preset Jobs / Canned Jobs ✅ Complete (Phase 13E)

**Problem:** Staff frequently add the same line items to estimates (e.g., oil change, brake pads, diagnostic fee). Entering them manually every time is slow and error-prone.

**Implemented solution:**
- New tables `canned_jobs` and `canned_job_items` (migration `010_canned_jobs.sql`).
- Each canned job has a name, category, sort order, and multiple line items with full pricing (cost, markup, customer price).
- **"Add Preset Job" button** added next to "Add Item" in the estimate builder line items header.
- **Preset picker modal** — two-column layout: job list on the left, item preview table on the right. Confirm adds all items to the estimate in one click.
- **"Presets" / Manage Canned Jobs button** accessible from the Customer Actions panel in the estimate builder.
- **Manage panel** — create/edit/deactivate canned jobs; add/edit items inline with the same cost/markup/customer-price fields as estimate items.
- `addCannedJobToEstimate()` helper copies all canned job items to the estimate preserving cost, markup, and pricing; calls `recalculateEstimateTotals` after insert.
- Internal cost and markup on canned job items are **never exposed** to customer-facing pages, approval emails, or Netlify Functions. Only `unit_price_cents` (customer price) flows into estimates.
- RLS: authenticated staff only. No anon access. No DELETE policy (soft deactivate via `is_active = false`).

**Files changed:**
- `supabase/migrations/010_canned_jobs.sql` (new)
- `src/lib/portalData.js` — 9 new helpers: `listCannedJobs`, `getCannedJob`, `createCannedJob`, `updateCannedJob`, `softHideCannedJob`, `listCannedJobItems`, `createCannedJobItem`, `updateCannedJobItem`, `addCannedJobToEstimate`
- `src/pages/portal/PortalEstimates.jsx` — new state, handlers, preset picker modal, manage canned jobs modal
- `src/styles/portal.css` — new canned jobs CSS section

---

### F. Horizontal Estimate Totals Display

**Problem:** The current estimate totals box sits as a card in the bottom-left. As the estimate builder grows, the layout feels unbalanced and doesn't match how shop software typically presents totals.

**Planned solution:**
- Redesign the estimate totals into a horizontal bar pinned to the bottom of the estimate builder view.
- Display in a single row (or two-row compact layout):
  - Subtotal | GST (5%) | Total | Approved Amount
- The bar should be visible at all times while editing without scrolling.
- Optionally sticky to the viewport bottom when the item list is long.

**Design notes:**
- This is a frontend-only change — no database or API changes required.
- Affects `src/pages/portal/PortalEstimates.jsx` and `src/styles/portal.css`.
- The current `portalEstTotals` CSS class will be replaced or extended.

---

---

### G. Staff Portal Logo Upgrade

**Problem:** The current staff portal sidebar/header uses text-only branding ("P.A.C.E. Power Automotive Centre of Excellence"). The owner wants the actual P.A.C.E. logo shown in the branding area.

**Planned solution:**
- Replace or enhance the text-only brand block in the sidebar with the real P.A.C.E. logo image.
- Use the existing logo asset already in `public/` (e.g., `pace-logo.png` or a suitable variant).
- Keep the "Staff Portal" badge visible below the logo.
- Ensure the logo is sized correctly — not distorted or stretched.
- Add `alt` text for accessibility.
- Sidebar layout should remain clean at all breakpoints.

**Design notes:**
- Frontend-only change — no database changes, no API changes.
- Affects `src/components/portal/PortalSidebar.jsx` and `src/styles/portal.css`.
- Consider whether the dark navy sidebar calls for an inverted/white version of the logo or the full-color version.
- A max-width and `object-fit: contain` should prevent distortion.

---

### H. Full-Width Portal Layout

**Problem:** The portal content currently has a fixed `max-width: 1280px` on `.portalContent`. On large monitors, the dashboard, tables, and detail panels feel cramped and leave wide unused margins.

**Planned solution:**
- Increase or remove the max-width cap on `.portalContent` so portal pages use more of the available window width.
- Keep comfortable left/right padding so content does not touch the viewport edge.
- Tables, dashboard cards, and detail panels should expand naturally on wide screens.
- Responsive behavior on laptop, tablet, and mobile must be preserved.
- Public website layout must remain unchanged.

**Design notes:**
- Frontend-only change — no database or API changes.
- Affects `src/styles/portal.css`, specifically the `.portalContent` rule.
- Consider a wider max-width (e.g., `1600px` or `none`) rather than a hard removal, to avoid unreadable ultra-wide cards on 4K monitors.
- May need minor adjustments to specific grid layouts (e.g., dashboard stat grid) to scale gracefully.

---

### I. Inactivity Auto Sign-Out

**Problem:** The staff portal contains private customer, vehicle, repair order, inspection, estimate, invoice, and payment-status information. If a staff member walks away and leaves the portal open, the session should not remain accessible indefinitely.

**Planned solution:**
- Add an inactivity timer to the staff portal (not the public website).
- After 10 minutes of no user activity, display a warning modal.
- Warning explains: "Your session will expire due to inactivity."
- User activity events that reset the timer: mouse movement, clicks, keyboard input, scrolling, touch events.
- Modal provides a "Stay Signed In" button that resets the timer and dismisses the modal.
- If the user does not respond within a short grace period (e.g., 60 seconds), automatically call `supabase.auth.signOut()` and redirect to `/portal`.

**Suggested timer behavior:**
- 10 min idle → show warning modal
- 60 sec grace period → if no action, sign out and redirect to `/portal`
- Any user activity → reset timer, dismiss modal if open

**Implementation notes:**
- Implemented as a React hook (e.g., `useInactivityTimer`) used inside `PortalLayout` or a wrapper component.
- Uses `addEventListener` on `window` for activity events (mousedown, keydown, touchstart, scroll, pointermove).
- Uses `supabase.auth.signOut()` from the existing Supabase client — no custom auth logic.
- Portal-only: the hook is only included in `PortalLayout`, never in public-facing pages.
- No passwords or sensitive data are logged.
- Timer state is client-only — no server calls while idle.

**Security notes:**
- This is a defense-in-depth measure. Supabase access tokens already expire (1 hour), but the idle logout provides an additional UX-level protection when a workstation is left unattended.
- Does not weaken existing Supabase RLS or authentication rules.
- After sign-out, protected routes redirect to `/portal` as normal.

---

### J. Sign-In Password Visibility Toggle

**Problem:** Staff occasionally need to visually verify their password before submitting the sign-in form, especially when entering a complex password on a shared workstation.

**Planned solution:**
- Add a show/hide toggle (eye icon) to the password field on the staff portal sign-in screen (`src/pages/portal/PortalLogin.jsx`).
- Password field defaults to `type="password"` (hidden).
- Clicking the eye icon toggles the field to `type="text"` (visible) and shows an eye-slash icon.
- Clicking again returns to hidden.
- Accessible: the toggle button has a descriptive `aria-label` ("Show password" / "Hide password").
- Toggle does not store, log, or transmit the password value in any new way — it only changes the input type locally in the DOM.

**Design notes:**
- Frontend-only change — no database or API changes.
- Affects `src/pages/portal/PortalLogin.jsx` only.
- Toggle button should be positioned inside or adjacent to the password input field.
- Styling should match the existing portal UI (subtle icon, consistent with the form design).
- Login submission behavior is completely unchanged.

---

### Phase 13 Acceptance Criteria

**Workflow improvements (A–F):**
- [ ] Staff can create a new customer from within the New Repair Order modal without leaving the page.
- [ ] After creating a customer in the RO modal, staff can optionally add a vehicle before completing the RO form.
- [ ] Repair orders support multiple labeled customer concern entries (list-style, not one blob of text).
- [ ] Customer detail page shows a history of past repair orders, inspections, estimates, and invoices.
- [ ] Vehicle detail page shows service history for that vehicle.
- [ ] Estimate line items optionally support cost price, markup percentage, and auto-calculated customer price.
- [ ] Cost and markup are never shown on the customer-facing approval page.
- [ ] Staff can insert a canned/preset job into an estimate with one action.
- [ ] Estimate totals display in a horizontal layout at the bottom of the estimate builder.

**Portal experience (G–J):**
- [ ] Actual P.A.C.E. logo appears in the staff portal sidebar branding area.
- [ ] Logo is correctly sized, not stretched or distorted.
- [ ] "Staff Portal" badge remains visible alongside the logo.
- [ ] Portal content uses full available browser width better on large screens.
- [ ] No horizontal overflow is introduced at any breakpoint.
- [ ] Staff portal signs out automatically after 10 minutes of inactivity.
- [ ] A warning modal appears before the automatic sign-out.
- [ ] Clicking "Stay Signed In" resets the timer and keeps the session active.
- [ ] Sign-out uses the existing Supabase auth flow and redirects to `/portal`.
- [ ] Sign-in screen has a working show/hide password toggle.
- [ ] Password is hidden by default; toggle only changes the DOM input type locally.

**Shared criteria:**
- [ ] All existing workflows (repair orders, inspections, estimates, approvals, invoices) continue to work unchanged.
- [ ] Public website is completely unaffected.
- [ ] No secrets are exposed in frontend code.
- [ ] No payment or card data is stored.
- [ ] No `.delete()` calls are added.

---

### Phase 14A — Detail View Modals + Modal Sizing

**Implemented:**
- RO detail converted from inline tile to `portalModalOverlay` + `portalModalCard portalModalLg` centered modal. Header contains RO number (monospace), status/payment badges, Edit button, Cancel RO button, and ✕ close. Click-outside-to-close via overlay.
- Invoice detail converted from inline tile to `portalModalOverlay` + `portalModalCard portalModalLg` centered modal. Header contains invoice number (monospace) with RO reference, status/payment badges, Edit button, and ✕ close. Click-outside-to-close via overlay.
- Estimate builder was already a dedicated full-page view — no modal conversion needed per spec.
- `.portalModalLg` added: `max-width: min(1100px, 92vw); max-height: 90vh`.
- `.portalCannedModal` enlarged: `max-width: min(1100px, 94vw)`. Layout height increased to `min(520px, 60vh)`.
- All existing actions (edit, status change, start inspection, create/view estimate, send approval, create Helcim invoice, payment actions) preserved inside modals.

**Acceptance criteria:**
- [x] RO detail opens as a centered modal overlay.
- [x] Invoice detail opens as a centered modal overlay.
- [x] All existing actions work inside the modals.
- [x] Large modals use more screen width/height — comfortable on desktop.
- [x] Manage Preset Jobs modal enlarged.
- [x] Scrolling is internal to modal content area; page behind does not scroll.
- [x] Public website unaffected.
- [x] No security regressions.
- [x] No internal cost/markup visible in any customer-facing view.

---

### Phase 14B — Printable Customer Invoice

**Implemented:**
- `Print` button added to the invoice detail modal header (next to Edit).
- `src/components/portal/InvoicePrintView.jsx` — new self-contained print component.
  - Shop header: P.A.C.E. / Power Automotive Centre of Excellence, address, phone, email, website.
  - Invoice meta: invoice number (monospace), RO number, invoice date, print date, payment status.
  - Bill To: customer name, phone, email.
  - Vehicle: year/make/model/trim, colour, VIN (monospace), license plate + province, odometer in/out.
  - Customer Concerns: from `repair_order_concerns` (structured list); falls back to legacy `customer_concern` text.
  - Line items table: description, type, qty, unit price, total. Uses `helcim_invoice_items` if available; falls back to approved `estimate_items` (customer-facing columns only).
  - Totals: subtotal, GST (5%), grand total, amount paid (if any), balance due (green if paid).
  - Invoice-level notes (no RO `internal_notes`).
  - Signature block: customer + service advisor lines.
  - Legal text: payment terms, storage notice, warranty, authorization acknowledgment.
- `getHelcimInvoice` updated: fetches vehicle `trim/color/vin/license_plate/plate_province`, RO `mileage_in/mileage_out/customer_concern`, and active `repair_order_concerns`. Returns `printItems` fallback from estimate items (safe columns only: no `cost_cents`, `markup_percent`).
- `@media print` CSS in `portal.css`: visibility trick hides all portal UI; shows only `.invPrintDoc`. Letter portrait, 0.7in margins. Professional black-on-white table layout.

**Security:**
- `cost_cents`, `markup_percent`, `customer_unit_price_cents` are never selected or rendered.
- RO `internal_notes` are never included.
- No secrets in `src/`.
- Print view is rendered only inside the authenticated portal — no public URL.

**Acceptance criteria:**
- [x] Print button visible in invoice detail modal.
- [x] Print preview shows only the customer invoice, not portal UI.
- [x] Shop header, contact info, customer, vehicle, RO/invoice numbers appear.
- [x] Line items show with customer-facing prices only.
- [x] Subtotal / GST / Total / Balance Due are correct.
- [x] Internal cost/markup do not appear.
- [x] Internal notes do not appear.
- [x] Existing invoice status/payment buttons unaffected.
- [x] Helcim logic unchanged.
- [x] No `.delete()` calls.
- [x] No secrets in `src/`.
- [x] Build passes.

---

### Phase 14C — Printable Internal Repair Order

**Implemented:**
- `src/components/portal/InternalROPrintView.jsx` — new staff-only print component (never customer-facing).
  - Shop header: P.A.C.E. / Power Automotive Centre of Excellence, address, phone.
  - Document title: REPAIR ORDER WORKSHEET + RO number (monospace).
  - 4-row info grid (matches DRAFT RO Internal.pdf): Customer / Date, Make / Model / Year+Trim, License Plate / Odometer (in + out), VIN / Promised Date.
  - Concerns section: numbered slots filled from `repair_order_concerns`; falls back to legacy `customer_concern`. Always shows minimum 7 slots with 2 blank write-lines below each concern.
  - Materials section: QTY / DESCRIPTION table with 9 blank rows for handwriting.
  - Technician Notes area: lined blank area.
  - Signature block: Technician Signature / Date Completed.
- `portalData.js` — `getRepairOrder` vehicle select updated to include `trim` and `vin`.
- `PortalRepairOrders.jsx` — imports `InternalROPrintView`; adds "Print Internal RO" button (with `title="Print mechanic worksheet"`) in the linked-actions row; renders `<InternalROPrintView>` outside the modal with `selected`, `detailData`, and `roConcerns` as props.
- `portal.css` — `@media screen { .roPrintDoc { display: none; } }` hides worksheet on screen. `@media print` visibility trick reveals only `.roPrintDoc`; black section title bars, bordered info grid, ruled concern lines, lined materials table, notes area with CSS rule lines. Letter portrait, 0.55in margins. Uses separate `.roPrint*` class namespace — no conflict with Phase 14B `.invPrint*` classes.

**Security:**
- `internal_notes` field is not printed. No cost/markup/secrets appear.
- Worksheet is rendered only inside the authenticated portal (`ProtectedRoute`). No public URL.

**Acceptance criteria:**
- [x] Print Internal RO button in RO detail modal linked-actions row.
- [x] Print preview shows only the mechanic worksheet, not portal UI.
- [x] Customer name, vehicle year/make/model, license plate, VIN, odometer, promised date printed.
- [x] Numbered concerns from `repair_order_concerns` appear; falls back to `customer_concern`.
- [x] Blank materials rows and technician notes area appear.
- [x] Invoice print (14B) still works; no conflict.
- [x] No `.delete()` calls. No secrets. Build passes.

---

### Phase 14D — RO Concerns to Estimate Job Groups

**Implemented:**
- `supabase/migrations/011_estimate_jobs.sql` — new `estimate_jobs` table (id, estimate_id FK, repair_order_concern_id FK nullable, title, notes, sort_order, is_active, created_at, updated_at); adds `estimate_job_id uuid null references estimate_jobs(id) on delete set null` column to `estimate_items`. RLS (authenticated staff only, no anon, no delete), indexes, updated_at trigger, grants.
- `src/lib/portalData.js` — added `listEstimateJobs`, `createEstimateJob`, `updateEstimateJob`, `softHideEstimateJob`, `ensureEstimateJobsFromRepairOrder` (idempotent — creates one job per active concern, skips if jobs already exist). Updated `getEstimate` to fetch jobs in parallel. Updated `createEstimateItem` + `updateEstimateItem` to accept `estimate_job_id`. Updated `addCannedJobToEstimate` to accept optional `estimateJobId` parameter.
- `src/pages/portal/PortalEstimates.jsx` — imports new helpers; adds `jobs` and `addingToJob` state; `openBuilderById` now loads jobs + calls `ensureEstimateJobsFromRepairOrder` on open; `backToList` clears jobs. `openAddModal(jobId)` and `openPresetModal(jobId)` accept optional job context. `handleAddItem`/`handleAddPreset` pass `addingToJob` to helpers. Added job CRUD handlers (`handleAddJob`, `handleJobTitleChange`, `handleJobNotesChange`, `handleJobBlur`, `handleHideJob`). Added `ItemTable` module-level component to eliminate duplicate table JSX. Line Items section now conditional: **flat mode** when no jobs exist (unchanged UI), **grouped mode** when jobs exist — each job section has inline-editable title + notes, per-job Add Item + Add Preset buttons, hide button; ungrouped section shows items without an active job.
- `netlify/functions/get-approval-estimate.js` — fetches active `estimate_jobs` (id, title, sort_order — notes excluded as internal-only); adds `estimate_job_id` to item select; returns `jobs` array in response. Cost/markup never returned.
- `src/pages/ApprovalPage.jsx` — grouped mode when `estData.jobs` non-empty: one card per job, ungrouped items in "Other Items" card. Flat mode fallback unchanged. Extracted `ApprovalItemRow` inline component to eliminate duplication.
- `src/styles/portal.css` — `.estJobSection`, `.estJobHeader`, `.estJobTitleRow`, `.estJobTitleInput`, `.estJobUngroupedTitle`, `.estJobNotesInput`, `.estJobActions`, `.estJobUngrouped` — transparent-border inline inputs reveal outline on hover/focus; compact padding for job headers.

**Security:**
- `estimate_jobs.notes` (internal staff notes) never returned from `get-approval-estimate.js`.
- `cost_cents`, `markup_percent`, `customer_unit_price_cents` never in any customer-facing path.
- No `estimate_jobs` anon policy. Customer access is server-side only via service role key.
- No `.delete()` calls. Soft-hide only (`is_active = false`).

**Acceptance criteria:**
- [x] Opening an estimate linked to an RO with concerns auto-creates job sections.
- [x] Job sections show inline-editable title and notes (blur-saves to DB).
- [x] Each job section has Add Item and Add Preset buttons that assign items to that job.
- [x] Ungrouped section shows items with no active job assignment.
- [x] Hide job section works; its items appear in Ungrouped section.
- [x] Add Job Section button creates a new empty job.
- [x] Existing estimates without jobs still show the flat Line Items UI (unchanged).
- [x] Customer approval page shows items grouped under job titles when jobs exist.
- [x] Flat approval mode unchanged when no jobs.
- [x] Helcim invoice creation (flat items) unaffected.
- [x] submit-estimate-approval.js unaffected (works on flat items).
- [x] send-estimate-approval.js unaffected (flat item email).
- [x] No secrets or cost/markup exposed. Build passes.

---

### Phase 14E — Dedicated Presets Page + Improved Job Group Removal

**Implemented:**
- `src/lib/portalData.js` — added `ungroupEstimateJobItems(estimateJobId)`: batch-sets `estimate_job_id = null` on all active items in a job section (does not recalculate prices); added `listAllCannedJobs()`: returns all canned jobs including inactive, for management pages.
- `src/pages/portal/PortalPresets.jsx` — new dedicated portal page at `/portal/presets`. Two-column layout: left sidebar lists all preset jobs (active + inactive with badges); right panel shows create/edit form (name, description, category, sort_order, deactivate/reactivate) plus inline items list (add item / edit item). All CRUD via existing portalData helpers. No hard delete. Cost/markup in staff-only pricing section only.
- `src/components/portal/PortalSidebar.jsx` — added "Presets" nav link (bolt icon) between Estimates and Invoices.
- `src/App.jsx` — added `/portal/presets` route wrapped in `ProtectedRoute`.
- `src/pages/portal/PortalEstimates.jsx` — imports `ungroupEstimateJobItems`; updated `handleHideJob`: confirmation text changed to "Remove this job group from the estimate? Existing line items will be moved to Ungrouped.", calls `ungroupEstimateJobItems(jobId)` first to null out items' `estimate_job_id` in DB, updates items state, then soft-hides the job; added "Manage Presets →" link in the preset picker modal footer (navigates to `/portal/presets`).

**Security:**
- `cost_cents`, `markup_percent`, `customer_unit_price_cents` appear only in the staff-authenticated Presets page — never in any customer-facing path.
- No `.delete()` calls. Preset jobs soft-hide via `is_active = false`. Canned job items do not have `is_active`; items can be edited but not individually deactivated (no schema change required).
- No schema migrations added in this phase (all tables already existed).

**Acceptance criteria:**
- [x] Sidebar shows "Presets" between Estimates and Invoices.
- [x] `/portal/presets` loads the full-page preset manager.
- [x] Can create a new preset job (name required, description/category/sort_order optional).
- [x] Can edit an existing preset job's details and save.
- [x] Can deactivate a preset job (it remains visible in the management list with an "Inactive" badge, disappears from the picker).
- [x] Can reactivate an inactive preset job.
- [x] Can add line items to a preset with full pricing (type, description, qty, cost, markup, customer price).
- [x] Can edit existing line items in a preset.
- [x] Estimate builder preset picker shows "Manage Presets →" link that navigates to the Presets page.
- [x] Removing a job group in the estimate builder shows updated confirmation and moves items to Ungrouped in DB (not just in UI).
- [x] Items moved to Ungrouped retain their prices (no recalculation).
- [x] Build passes.

---

## Phase Completion Checklist

| Phase | Feature | Status |
|---|---|---|
| 0 | Planning documentation | ✅ Complete |
| 1 | Routing foundation | ✅ Complete |
| 2 | Portal UI shell | ✅ Complete |
| 3 | Supabase + real auth | ✅ Complete |
| 4 | Customers + vehicles | ✅ Complete |
| 5 | Appointment requests | ✅ Complete |
| 6 | Repair orders | ✅ Complete |
| 7 | Inspections + photos | ✅ Complete |
| 8 | Estimates + approval links | ✅ Complete |
| 9A | Helcim database setup | ✅ Complete |
| 9B | Manual invoice linking + payment tracking | ✅ Complete |
| 9C | Helcim API invoice creation | ✅ Complete |
| 9D | Helcim webhook payment sync | ✅ Built — awaiting live payment test |
| 10 | Dashboard / shop command centre | ✅ Complete |
| 11 | Portal polish, security hardening, production readiness | ✅ Complete |
| 12 | SMS approval links | ⏸ Deferred — pending owner/provider decision |
| 13A | Portal UI + session usability (logo, layout, inactivity, pw toggle) | ✅ Complete |
| 13B | Repair order intake: inline new customer + inline new vehicle + multiple concerns | ✅ Complete |
| 13C | Customer and vehicle service history view (read-only consolidated history per customer/vehicle) | ✅ Complete |
| 13D | Estimate line item internal cost, markup %, and customer price fields | ✅ Complete |
| 13E | Canned jobs / preset job bundles — Add Preset Job button in estimate builder, preset picker modal, Manage Canned Jobs panel | ✅ Complete |
| 13F | Horizontal estimate totals bar — full-width navy bar replacing the vertical totals box | ✅ Complete |
| 14A | Detail view modals + modal sizing — RO and invoice details as centered modals; `.portalModalLg`; Manage Preset Jobs enlarged | ✅ Complete |
| 14B | Printable customer invoice — Print button + letter-print layout via `@media print`; cost/markup excluded | ✅ Complete |
| 14C | Printable internal RO — mechanic worksheet auto-filled from RO concerns, vehicle, customer | ✅ Complete |
| 14D | RO concerns → estimate job groups — concerns auto-populate as grouped sections in the estimate builder | ✅ Complete |
| 14E | Dedicated Presets page + improved job group removal (items ungroup in DB, not just UI) | ✅ Complete |
| 15A | Percent or fixed dollar markup on estimate items and preset items | ✅ Complete |
| 15B | Sidebar / portal UX cleanup — move Presets to footer Setup section | ✅ Complete |
| 15C | Owner-ready cleanup / QA — stale label removal, test data cleanup SQL, owner demo checklist, security audit | ✅ Complete |

---

### Phase 15A — Pricing Markup Options: Percentage or Fixed Dollar

**Implemented:**
- `supabase/migrations/012_markup_type.sql` — adds `markup_type text not null default 'percent'` (check: 'percent' or 'fixed') and `markup_value_cents int4 null check >= 0` to both `estimate_items` and `canned_job_items`. Comments mark both as staff-only. Existing rows default to `markup_type = 'percent'` — no behavior change.
- `src/lib/portalData.js` — `createEstimateItem` and `createCannedJobItem` accept `markup_type` and `markup_value_dollars`/`markup_value_cents`; store `markup_type` and `markup_value_cents`, null out the unused markup column. `updateEstimateItem` and `updateCannedJobItem`: added `markup_type` and `markup_value_cents` to ALLOWED lists; accept `markup_value_dollars`; null out unused column when type is set. `addCannedJobToEstimate`: copies `markup_type` and `markup_value_cents` from canned item to estimate item.
- `src/pages/portal/PortalEstimates.jsx` — `EMPTY_ITEM_FORM` adds `markup_type: "percent"` and `markup_value_dollars: ""`; `validateItemForm` validates both modes; `handleItemField` auto-calculates customer price for both percent (`cost × (1 + pct/100)`) and fixed (`cost + fixed`) modes; `openEditModal` loads `markup_type` and `markup_value_dollars` from saved item; `ItemForm` component pricing section: replaces single "Markup (%)" field with a Markup Type selector (Percent / Fixed $) + context-sensitive Markup Value input; inline cost hint updated to show fixed vs percent marker. Same changes applied to manage canned jobs inline item forms (`openEditJobItem`, `handleManageItemField`, edit/add pricing rows).
- `src/pages/portal/PortalPresets.jsx` — same pricing controls update: `EMPTY_ITEM_FORM`, `validateItemForm`, `openEditItem`, `handleItemField`, `ItemForm` component, and item row cost hint.
- `src/components/portal/PortalSidebar.jsx` — footer label updated from "Phase 13A" to "P.A.C.E. Portal".

**Security:**
- `markup_type` and `markup_value_cents` are internal-only pricing fields. They are NOT selected in `get-approval-estimate.js`, `send-estimate-approval.js`, `submit-estimate-approval.js`, or `helcim-create-invoice.js` (all use explicit column allowlists that predate and do not include these columns). No changes to any customer-facing Netlify Function required.
- `ApprovalPage.jsx` reads only from `get-approval-estimate.js` — no internal pricing exposed.
- `InvoicePrintView.jsx` uses only `unit_price_cents` and `line_total_cents` — no internal pricing exposed.
- Helcim invoice creation uses `unit_price_cents` (the final customer-facing price) — unaffected.
- No `.delete()` calls. No hard deletes.

**Acceptance criteria:**
- [x] Cost $50 + Percent 25% → Customer Price $62.50 (auto-calculated).
- [x] Cost $50 + Fixed $20 → Customer Price $70.00 (auto-calculated).
- [x] Customer price can be manually overridden in both modes.
- [x] Switching markup type resets auto-calc to the new mode's formula.
- [x] Existing items (markup_type defaults to 'percent') load and save correctly.
- [x] Preset items support both markup modes; copying a preset to an estimate preserves markup_type and markup_value_cents.
- [x] Cost hint in item table shows "+$X.XX fixed" or "+X%" appropriately.
- [x] No internal pricing fields in any customer-facing output.
- [x] Build passes.

---

### Phase 15B — Sidebar / Portal UX Cleanup

**Implemented:**
- `src/components/portal/PortalSidebar.jsx` — Removed Presets from the main `navItems` list. Footer section replaced: now contains a "Setup" `portalNavSection` label, a `NavLink` to `/portal/presets` using the existing `portalNavLink` / `portalNavLink.active` styles (active state highlights on the Presets route), and the "P.A.C.E. Portal" version tag.
- `src/styles/portal.css` — `.portalSidebarFooter` padding changed from `16px 20px` to `0` so the NavLink's own `padding: 10px 20px` handles alignment consistently with main menu links. `.portalVersionTag` gains its own `padding: 6px 20px 12px` to preserve spacing.

**Main menu after change:**
Dashboard · Customers · Vehicles · Appointments · Repair Orders · Inspections · Estimates · Invoices

**Footer after change:**
Setup (section label) → Presets (NavLink, active-highlighted) → P.A.C.E. Portal (dim version tag)

**Not changed:** routing (`/portal/presets` route untouched), database, Helcim functions, approval functions, public website, any pricing/markup logic.

**Acceptance criteria:**
- [x] Presets removed from main menu.
- [x] Presets link appears at bottom of sidebar under "Setup" heading.
- [x] Active state highlights Presets link when on `/portal/presets`.
- [x] All eight main menu items navigate correctly.
- [x] No stale phase numbers visible in portal UI.
- [x] Presets page still loads; preset CRUD still works.
- [x] Estimate builder "Add Preset Job" and "Manage Presets →" link still work.
- [x] Build passes.

---

### Phase 15C — Owner-Ready Cleanup / QA

**Implemented:**

**Part A — UI cleanup:**
- `src/pages/portal/PortalInvoices.jsx` — Removed production-facing "Phase 9D" span text from the disabled Sync button. Updated button tooltip from "coming in Phase 9D" to "Payment status syncs automatically via Helcim webhook". This was the only phase label rendered in the portal UI.
- All other phase references are developer code comments only (portalData.js section headers, portal.css section comments) — these are internal developer annotations, not visible in the portal UI, and are left unchanged.

**Part B — Empty/loading/error states:**
- All portal pages confirmed to have proper empty, loading, and error states:
  - Vehicles, Repair Orders, Customers, Appointments, Inspections, Estimates, Invoices, Presets — all have `portalEmptyState` blocks with friendly text, icons, and retry buttons where applicable.
  - No rough or broken-looking states found. No changes needed.

**Part C — Test data cleanup:**
- `docs/TEST_DATA_CLEANUP.sql` — new file. Manual-use-only SQL script for Supabase Dashboard. Contains SELECT preview queries followed by commented-out soft-delete/UPDATE statements in safe dependency order: estimate_items → estimate_jobs → approval_tokens → estimates → inspection_items → inspections → repair_order_concerns → repair_orders → vehicles → customers. Hard-delete for appointment_requests (which has no is_active column). Targets customers with test-looking names/emails. COMMIT is commented out; ROLLBACK is active until confirmed.

**Part D — Owner demo checklist:**
- `docs/OWNER_DEMO_CHECKLIST.md` — new file. End-to-end 14-section checklist covering all portal workflows: auth, dashboard, customers, vehicles, appointments, ROs, inspections, estimates (manual items + internal pricing + presets + job groups), customer approval, invoices, Presets page, security verification, sidebar navigation, and a deferred items table.

**Part E — Security audit (no changes needed):**
- **No secrets in `src/`** — confirmed zero matches for all four secret key names.
- **No Supabase `.delete()` calls** — the two `Set.delete()` calls in `PortalInspections.jsx` are JavaScript `Set` operations, not Supabase queries.
- **Customer-facing Netlify function allowlists confirmed:**
  - `get-approval-estimate.js`: `estimate_items` select = `id,item_type,description,quantity,unit_price_cents,line_total_cents,is_required,approval_status,estimate_job_id`
  - `send-estimate-approval.js`: `estimate_items` select = `id, description, item_type, quantity, unit_price_cents, line_total_cents, is_required`
  - `submit-estimate-approval.js`: `estimate_items` select = `id,item_type,description,line_total_cents,is_required,approval_status`
  - `helcim-create-invoice.js`: uses `item.unit_price_cents` only (customer-facing price)
  - None contain `cost_cents`, `markup_percent`, `markup_type`, `markup_value_cents`, `customer_unit_price_cents`, or `internal_notes`.

**Acceptance criteria:**
- [x] No phase numbers visible in portal UI.
- [x] Invoices Sync button shows clean tooltip, no phase label.
- [x] All pages have polished empty/loading/error states.
- [x] Test data cleanup SQL created.
- [x] Owner demo checklist created.
- [x] No secrets in src.
- [x] No Supabase `.delete()` calls.
- [x] All four customer-facing functions use explicit column allowlists excluding internal pricing.
- [x] Build passes.

---

## Backlog / Future Phases (Not Yet Scheduled)

## Phase 9D Live Testing Checklist
Phase 9D is built and configured. Live verification requires an in-person Helcim terminal payment. Before signing off Phase 9D as fully tested:

- [ ] `HELCIM_WEBHOOK_VERIFIER_TOKEN` added to Netlify environment variables
- [ ] Webhook delivery URL configured in Helcim dashboard → All Tools → Integrations → Webhooks
  - URL: `https://powerautomotive.ca/.netlify/functions/payment-event-sync`
  - Webhook must be active and subscribed to `cardTransaction` events
- [ ] Create a test Helcim invoice in the portal
- [ ] Take a small in-person payment via Helcim terminal
- [ ] Confirm `helcim_payment_events` row inserted in Supabase
- [ ] Confirm `helcim_invoices.payment_status` updated to `paid` or `partial`
- [ ] Confirm `repair_orders.payment_status` updated (only to `unpaid`/`partial`/`paid`)
- [ ] Confirm `activity_logs` entry for `invoice.payment_synced`
- [ ] Confirm no card numbers, CVV, expiry, or bank details in `raw_payload`
- [ ] Confirm `helcim_invoices.helcim_customer_id` saved correctly
