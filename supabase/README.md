# P.A.C.E. — Supabase Database Setup

This folder contains SQL migration files for the P.A.C.E. staff portal database.
All migrations are run manually in the Supabase SQL Editor.

---

## Migration Index

| File | Phase | Tables Created |
|---|---|---|
| `001_customers_vehicles.sql` | Phase 4A | `customers`, `vehicles`, `activity_logs` |

---

## How to Run a Migration

1. Open the [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your **P.A.C.E. project** (`tvmdkohbmljixgdppdex`)
3. In the left sidebar, click **SQL Editor**
4. Click **New query**
5. Open the migration file from this folder in a text editor
6. Copy the **entire file contents** and paste into the SQL Editor
7. Click **Run**
8. Look for a success message at the bottom of the editor

---

## After Running Each Migration — Verify in Table Editor

Go to **Table Editor** in the Supabase left sidebar and confirm:

### After `001_customers_vehicles.sql`

- [ ] `customers` table exists with all columns
- [ ] `vehicles` table exists with all columns
- [ ] `activity_logs` table exists with all columns
- [ ] RLS is enabled on `customers` (lock icon visible in Table Editor)
- [ ] RLS is enabled on `vehicles`
- [ ] RLS is enabled on `activity_logs`

### Verify Policies (Authentication → Policies in Supabase)

Go to **Authentication → Policies** and confirm:

**customers table:**
- [ ] `customers: authenticated users can select`
- [ ] `customers: authenticated users can insert`
- [ ] `customers: authenticated users can update`
- [ ] No DELETE policy exists

**vehicles table:**
- [ ] `vehicles: authenticated users can select`
- [ ] `vehicles: authenticated users can insert`
- [ ] `vehicles: authenticated users can update`
- [ ] No DELETE policy exists

**activity_logs table:**
- [ ] `activity_logs: authenticated users can select`
- [ ] `activity_logs: authenticated users can insert`
- [ ] No UPDATE policy exists
- [ ] No DELETE policy exists

### Verify Triggers (Database → Triggers in Supabase)

Go to **Database → Triggers** and confirm:

- [ ] `trg_customers_updated_at` trigger exists on `customers`
- [ ] `trg_vehicles_updated_at` trigger exists on `vehicles`
- [ ] No trigger on `activity_logs` (logs are immutable — no updated_at)

### Verify Indexes (Database → Indexes in Supabase)

Go to **Database → Indexes** and confirm indexes exist for:

- [ ] `idx_customers_last_name`
- [ ] `idx_customers_email`
- [ ] `idx_customers_phone`
- [ ] `idx_customers_is_active`
- [ ] `idx_vehicles_customer_id`
- [ ] `idx_vehicles_make`
- [ ] `idx_vehicles_model`
- [ ] `idx_vehicles_vin`
- [ ] `idx_vehicles_license_plate`
- [ ] `idx_vehicles_is_active`
- [ ] `idx_activity_logs_entity`
- [ ] `idx_activity_logs_created`

---

## Security Rules — Always Follow These

| Rule | Details |
|---|---|
| **Never use the service role key in frontend code** | The service role key bypasses RLS entirely. It belongs only in Netlify environment variables for use by Netlify Functions (server-side). |
| **Frontend uses only anon key** | `VITE_SUPABASE_ANON_KEY` is the publishable key. It is safe to expose because RLS policies enforce access control. |
| **No anonymous access policies** | All policies in this migration use `to authenticated` — public/anon users have zero access to portal data. |
| **Soft deletes only** | Never add DELETE policies or run `DELETE` queries on customer/vehicle records. Use `is_active = false` instead. |
| **Activity logs are permanent** | Never run `DELETE` or `UPDATE` on `activity_logs`. They are an audit trail. |

---

## Environment Variables Reference

| Variable | Where Used | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | React frontend (`src/`) | Safe to expose. Set in `.env.local` for dev, Netlify env vars for prod. |
| `VITE_SUPABASE_ANON_KEY` | React frontend (`src/`) | Safe to expose. Protected by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify Functions only | **Never in `src/`.** Server-side operations only. Add to Netlify env vars. |

---

## Naming Conventions for Future Migrations

| File | Description |
|---|---|
| `001_customers_vehicles.sql` | Phase 4A |
| `002_appointment_requests.sql` | Phase 5 — appointment request table |
| `003_repair_orders.sql` | Phase 6 — repair order table |
| `004_inspections.sql` | Phase 7 — inspections, inspection_items, inspection_photos |
| `005_estimates.sql` | Phase 8 — estimates, estimate_items, approval_tokens |
| `006_invoices.sql` | Phase 9 — invoices table |
