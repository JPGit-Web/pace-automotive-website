# P.A.C.E. Staff Portal — Quick Start Guide

**P.A.C.E. — Power Automotive Centre of Excellence**
Portal: **powerautomotive.ca/portal**

> For the full step-by-step manual, see **OWNER_USER_MANUAL.md**.

---

## 1. Login and Sign Out

**Login:**
1. Go to **powerautomotive.ca/portal**
2. Enter your staff email and password → click **Sign In**

**Sign out:**
Click **Sign Out** at the bottom of the left sidebar. Always sign out when done, especially on a shared computer.

**Auto sign-out:**
If the portal is left unused, it will automatically sign you out after a period of inactivity. You will see a warning first — click to stay signed in if you are still working.

---

## 2. Daily Workflow

| Step | Action |
|---|---|
| 1 | Check the **Dashboard** for overnight bookings and pending approvals |
| 2 | Review **Appointments** — confirm incoming vehicles for the day |
| 3 | **Convert appointment to Repair Order** (or create a new RO directly) |
| 4 | Add/confirm **customer**, **vehicle**, and **customer concerns** |
| 5 | **Print Internal RO** worksheet and hand to the technician |
| 6 | Build the **Estimate** using line items and/or preset jobs |
| 7 | **Send estimate** to the customer for approval |
| 8 | Customer approves → **Create Invoice** |
| 9 | **Take payment** via Helcim terminal |
| 10 | Confirm payment status updated → **Close the Repair Order** |

---

## 3. Main Pages

| Page | What It Is For |
|---|---|
| **Dashboard** | Shop overview — pending items, RO pipeline, recent activity |
| **Customers** | Customer contact records and service history |
| **Vehicles** | Vehicle records linked to customers |
| **Appointments** | Booking requests from web form, phone, or walk-in |
| **Repair Orders** | Central record for each vehicle visit |
| **Inspections** | Vehicle condition inspection for each RO |
| **Estimates** | Estimate builder — line items, pricing, approval |
| **Invoices** | Invoices, Helcim links, payment status |
| **Presets** *(sidebar bottom)* | Reusable job templates — setup tool |

---

## 4. Creating a Repair Order

1. Click **Repair Orders** → **New Repair Order**
2. Select or create the **Customer** (name, phone, email)
3. Select or create the **Vehicle** (year, make, model, plate)
4. Add each **Customer Concern** as a separate line (e.g., "Brakes grinding", "Oil change due")
5. Enter **Mileage In** and **Promised Date** if known
6. Click **Save Repair Order**

The RO is assigned a number automatically (e.g., RO-2026-0031).

---

## 5. Printing the Internal RO

1. Open the Repair Order
2. Click **Print Internal RO**
3. In the print dialog, turn off **Headers and Footers** for a clean printout
4. Print or save as PDF
5. Hand the worksheet to the technician — they write their diagnosis, parts, and work notes on it

---

## 6. Building and Sending an Estimate

1. Open the Repair Order → click **Create Estimate** (or **Open Estimate**)
2. Each customer concern automatically becomes a **job section** in the estimate
3. Under each section, click **Add Item** to add labour, parts, supplies, fees, or discounts
   — or click **Add Preset Job** to insert a saved template
4. For each item, set the **Customer Price** (and optionally, internal cost and markup — staff-only, never shown to customers)
5. Check the **Totals Bar** — subtotal, GST, and total should look correct
6. Click **Send Approval Link** → confirm the customer's email → send
7. The customer receives an email with a secure link to review and approve

---

## 7. Creating and Printing the Invoice

1. After customer approval, open the Repair Order → click **Create Invoice**
2. Link or create the Helcim invoice from the invoice detail panel
3. Take payment via the Helcim terminal — payment status syncs automatically
4. To print the **customer invoice**:
   - Open the Invoice → click **Print Invoice**
   - Turn off **Headers and Footers** in the print dialog
   - Print or click **Save as PDF**

**Suggested PDF file names:**
- `PACE_INV001012` (by invoice number)
- `PACE_RO-2026-0029` (by RO number)

---

## 8. Presets

Presets are reusable job templates for common repairs (e.g., Oil Change, Brake Service, Diagnostic).

**To manage presets:**
1. Click **Presets** at the bottom of the sidebar (under "Setup")
2. Click **New Preset** → add a name, category, and line items
3. To disable a preset: click **Deactivate** (it can be reactivated anytime)

**To use a preset in an estimate:**
1. Open the estimate → click **Add Preset Job**
2. Browse by category, preview items, click **Add to Estimate**
3. Edit individual items in the estimate without affecting the original preset

> Set up presets before daily use — they save time on every estimate.

---

## 9. Important Safety Notes

| Rule | Why |
|---|---|
| Do not share the staff login | Keeps actions traceable and the portal secure |
| Do not put internal cost or markup in customer-facing descriptions or notes | Customers see those fields on their approval page |
| Do not store card numbers or CVV codes anywhere in the portal | Helcim handles all payment data securely |
| Do not delete records | Use Cancelled, Closed, Archived, or Deactivated statuses instead |
| Do not share approval links with the wrong person | Links are for the specific customer only |

---

## 10. Quick Troubleshooting

| Problem | What To Try |
|---|---|
| Approval email not received | Check customer email is correct → ask customer to check spam → try sending again |
| Printout shows browser date/URL | Turn off **Headers and Footers** in the print dialog |
| Invoice payment status not synced | Wait a few minutes → use the Sync button in the invoice panel |
| Customer or vehicle not found in a selector | Create the record in Customers or Vehicles first, then return |
| Estimate totals look wrong | Check item quantities and prices → confirm no items are hidden → confirm GST is 5% |
| Preset not appearing in the picker | Go to Presets page → check if the preset is **Inactive** → click Reactivate |
| Page won't load | Refresh the browser → sign out and sign back in → contact administrator |

---

*P.A.C.E. — Power Automotive Centre of Excellence | Staff Portal Quick Start Guide*
*For the full manual, see docs/OWNER_USER_MANUAL.md*
