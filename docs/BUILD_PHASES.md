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

## Phase Completion Checklist

| Phase | Feature | Status |
|---|---|---|
| 0 | Planning documentation | ✅ Complete |
| 1 | Routing foundation | ⬜ Not started |
| 2 | Portal UI shell | ⬜ Not started |
| 3 | Supabase + real auth | ⬜ Not started |
| 4 | Customers + vehicles | ⬜ Not started |
| 5 | Appointment requests | ⬜ Not started |
| 6 | Repair orders | ⬜ Not started |
| 7 | Inspections + photos | ⬜ Not started |
| 8 | Estimates + approval links | ⬜ Not started |
| 9 | Helcim invoice (manual) | ⬜ Not started |
| 10 | Helcim webhook (auto) | ⬜ Not started |
| 11 | Dashboard + reporting | ⬜ Not started |
| 12 | SMS approval links | ⬜ Not started |
