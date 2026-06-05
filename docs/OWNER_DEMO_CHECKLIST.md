# P.A.C.E. Portal — Owner Demo Checklist

Use this checklist to verify that all portal workflows are working correctly before owner review or production hand-off. Each item should be tested end-to-end in the live environment.

---

## Setup

- [ ] Clean test data using `docs/TEST_DATA_CLEANUP.sql` (run SELECTs to preview, then un-comment DELETEs).
- [ ] Confirm Supabase environment variables are set in Netlify: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `HELCIM_API_TOKEN`, `HELCIM_WEBHOOK_VERIFIER_TOKEN`.
- [ ] Confirm Helcim webhook is configured to send `cardTransaction` events to `/.netlify/functions/payment-event-sync`.

---

## 1. Authentication

- [ ] Navigate to `/portal`. Login page loads with P.A.C.E. branding.
- [ ] Enter wrong password → shows error, does not log in.
- [ ] Enter correct credentials → redirects to `/portal/dashboard`.
- [ ] Leave portal idle → inactivity auto sign-out triggers (warning then logout).
- [ ] Sign out via sidebar sign-out button → returns to login page.
- [ ] Navigating to `/portal/dashboard` while logged out → redirects to login.

---

## 2. Dashboard

- [ ] Dashboard loads without errors.
- [ ] Stat cards show correct counts: open ROs, pending approvals, today's appointments.
- [ ] Attention sections show pending approval requests and overdue items (if any exist).
- [ ] "View all" links navigate to correct pages.
- [ ] Dashboard loads quickly (under 2 seconds on a normal connection).

---

## 3. Customers

- [ ] Customer list loads with search bar.
- [ ] Search filters by name, email, or phone in real time.
- [ ] Click "New Customer" → modal opens with required fields.
- [ ] Submit empty form → validation errors appear.
- [ ] Fill in name, email, phone → saves. New customer appears in list.
- [ ] Click a customer → detail panel opens with service history tab.
- [ ] Edit customer → changes save correctly.
- [ ] Service history shows linked ROs, estimates, and inspections.

---

## 4. Vehicles

- [ ] Vehicle list loads with search.
- [ ] Search filters by make, model, VIN, plate, or customer name.
- [ ] "New Vehicle" → customer required, year/make/model required.
- [ ] Save → vehicle appears in list linked to customer.
- [ ] Click vehicle → detail shows service history for that vehicle.

---

## 5. Appointment Requests

- [ ] Appointments list loads with status filter.
- [ ] "New Appointment" → form with name, phone, email, service requested, preferred date.
- [ ] Save → appointment appears in list with "new" status.
- [ ] Click appointment → detail panel with status controls.
- [ ] Change status to "contacted" → status badge updates.
- [ ] "Convert to Repair Order" → modal asks for customer, vehicle, mileage.
  - [ ] Assign existing customer and vehicle.
  - [ ] Confirm → new RO created. Appointment status updates to "converted".
  - [ ] New RO appears in Repair Orders list.

---

## 6. Repair Orders

- [ ] Repair Orders list loads with search and status filter.
- [ ] "New Repair Order" → requires customer, vehicle, at least one concern.
  - [ ] Inline "New Customer" works if customer does not exist yet.
  - [ ] Inline "New Vehicle" works if vehicle does not exist yet.
- [ ] Add 2–3 concerns (e.g., "Brakes grinding", "Oil change due", "Check engine light").
- [ ] Save → RO created with auto-assigned RO number.
- [ ] Click RO → detail modal opens.
- [ ] Edit RO → status, mileage in/out, promised date, internal notes all editable.
- [ ] **Print Internal RO** → browser print dialog opens with formatted worksheet.
  - [ ] Customer name, vehicle, odometer, concerns appear.
  - [ ] Internal notes do NOT appear on the print.
  - [ ] Cost/markup fields do NOT appear.

---

## 7. Inspections

- [ ] From RO detail, click "Start Inspection" (or open from Inspections list).
- [ ] Inspection loads with category sections.
- [ ] Add item: category, description, condition (Good / Fair / Poor / Critical).
- [ ] Add note to an item → saves inline.
- [ ] Upload photo to an item → photo appears.
- [ ] Condition ratings save on change (auto-save).
- [ ] Inspection status changes as items are filled.

---

## 8. Estimates

### 8A. Creating an Estimate

- [ ] From RO detail, click "Create Estimate".
- [ ] Estimate builder opens for that RO.
- [ ] RO concerns automatically appear as named job group headers (e.g., "Brakes grinding", "Oil change due").
- [ ] Ungrouped section available for items not tied to a specific concern.

### 8B. Line Items — Manual

- [ ] Click "Add Item" under a job group.
- [ ] Select item type: Labor / Part / Supply / Fee / Discount.
- [ ] Enter description, quantity, customer unit price → line total calculates.
- [ ] Mark item required or optional.
- [ ] Set customer visibility.
- [ ] Save → item appears in the group.
- [ ] Edit item → modal pre-populates correctly. Changes save.

### 8C. Line Items — Internal Pricing (Staff Only)

- [ ] In Add/Edit Item modal, expand internal pricing section.
- [ ] Enter cost (e.g., $50.00).
- [ ] **Percent markup test**: Set markup type to "Percent", enter 25%. Customer price auto-calculates to $62.50.
- [ ] **Fixed dollar markup test**: Set markup type to "Fixed $", enter $20.00. Customer price auto-calculates to $70.00.
- [ ] Manually override customer price → saves the overridden value.
- [ ] Cost and markup fields do NOT appear in customer-facing output (verified below).

### 8D. Preset Jobs

- [ ] Click "Add Preset Job" → picker modal opens.
- [ ] Presets are grouped by category with item previews.
- [ ] Select a preset → items are added to the estimate with correct pricing.
- [ ] "Manage Presets →" link in the picker navigates to `/portal/presets`.

### 8E. Job Group Management

- [ ] Remove a job group → confirmation message: "Remove this job group from the estimate? Existing line items will be moved to Ungrouped."
- [ ] After removal, items from that group appear in Ungrouped section.
- [ ] Items are correctly unlinked from the job in the database (verify via Supabase if needed).

### 8F. Estimate Totals

- [ ] Totals bar shows Subtotal / GST (5%) / Total correctly.
- [ ] Approved total appears if any items have been approved.

---

## 9. Customer Approval

### 9A. Sending the Approval Link

- [ ] In estimate builder, scroll to Customer Actions.
- [ ] Click "Send Approval Link" → confirm customer email is shown.
- [ ] Send → confirmation message shown. Email arrives at customer address.
- [ ] Email contains a link to `/approve/<token>`.

### 9B. Customer Approval Page (open link in incognito / different browser)

- [ ] Approval page loads without staff login.
- [ ] Estimate name, line items, and totals are shown.
- [ ] Customer can approve or decline individual optional items.
- [ ] Required items cannot be declined.
- [ ] **CRITICAL: Cost, markup_percent, markup_type, markup_value_cents, and internal notes do NOT appear.**
- [ ] Customer submits approval → success message shown.
- [ ] Back in portal: estimate status updates to reflect approved items.

---

## 10. Invoices

- [ ] Invoice list loads.
- [ ] "New Invoice" or create from RO → invoice record created.
- [ ] Edit invoice: add total, notes, Helcim invoice ID.
- [ ] "Create in Helcim" button (if Helcim API configured) → creates invoice in Helcim.
  - [ ] Button is disabled if RO not linked or total is $0.
- [ ] **Print Customer Invoice** → print dialog opens.
  - [ ] Shop header (P.A.C.E. / Power Automotive Centre), customer name, vehicle, line items, totals appear.
  - [ ] **CRITICAL: Cost, markup, and internal notes do NOT appear on print.**
  - [ ] GST and total match estimate totals.
- [ ] Payment status updates correctly when Helcim webhook fires.
- [ ] Manual Sync button is disabled (auto-sync via webhook is active).

---

## 11. Presets (bottom of sidebar)

- [ ] Click "Presets" in sidebar bottom Setup area → navigates to `/portal/presets`.
- [ ] "Presets" link is highlighted (active state) while on that page.
- [ ] Preset list loads in left panel (active and inactive, with badges).
- [ ] "New Preset" → create form opens in right panel.
- [ ] Fill in name, category, description, sort order → save.
- [ ] New preset appears in left panel.
- [ ] Click preset → edit form loads. Changes save.
- [ ] Add item to preset → pricing section shows Markup Type (Percent / Fixed $).
  - [ ] Percent mode: enter cost + percent → customer price auto-calculates.
  - [ ] Fixed mode: enter cost + fixed dollar → customer price auto-calculates.
- [ ] Deactivate preset → badge shows "Inactive". Preset no longer appears in estimate builder picker.
- [ ] Reactivate preset → returns to active state.

---

## 12. Security Verification

- [ ] Open customer approval page in incognito. Inspect page source / network tab.
  - [ ] `cost_cents` not present in any API response.
  - [ ] `markup_percent` not present.
  - [ ] `markup_type` not present.
  - [ ] `markup_value_cents` not present.
  - [ ] `customer_unit_price_cents` not present.
  - [ ] `internal_notes` not present.
- [ ] Printed customer invoice does not show cost or markup.
- [ ] Helcim invoice uses customer-facing prices only.
- [ ] No secrets visible in browser JavaScript bundles (`SUPABASE_SERVICE_ROLE_KEY`, `HELCIM_API_TOKEN`, `RESEND_API_KEY` are Netlify environment variables only).

---

## 13. Sidebar Navigation

- [ ] All main menu items navigate correctly:
  - [ ] Dashboard
  - [ ] Customers
  - [ ] Vehicles
  - [ ] Appointments
  - [ ] Repair Orders
  - [ ] Inspections
  - [ ] Estimates
  - [ ] Invoices
- [ ] Setup section at bottom:
  - [ ] Presets link navigates to `/portal/presets`.
  - [ ] Active state highlights correctly.
- [ ] No stale phase labels visible anywhere in the portal UI.
- [ ] Sidebar version tag shows "P.A.C.E. Portal" (no phase numbers).

---

## 14. Known Deferred Items (not blocking demo)

| Feature | Status | Notes |
|---|---|---|
| Appointment Calendar | Phase 16A — planned | Full day/week grid with status colours; deferred pending owner UX approval |
| SMS Approval Links | Deferred | Pending owner confirmation of SMS provider (Twilio) |
| Multiple Staff Accounts | Post-MVP | Schema ready; single login in use |
| Technician Time Tracking | Backlog | Not scheduled |
| Parts Ordering Integration | Backlog | Not scheduled |

---

*Last updated: Phase 15C*
