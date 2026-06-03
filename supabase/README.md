# P.A.C.E. — Supabase Database Setup

This folder contains SQL migration files for the P.A.C.E. staff portal database.
All migrations are run manually in the Supabase SQL Editor.

---

## Migration Index

| File | Phase | Tables Created |
|---|---|---|
| `001_customers_vehicles.sql` | Phase 4A | `customers`, `vehicles`, `activity_logs` |
| `002_appointment_requests.sql` | Phase 5A | `appointment_requests` |
| `002b_service_role_grants.sql` | Phase 5B | service_role grants for `appointment_requests` |
| `003_repair_orders.sql` | Phase 6A | `repair_orders`, RO number sequence, FK from `appointment_requests` |
| `003b_repair_order_sequence_grants.sql` | Phase 6B | sequence grants for `repair_order_number_seq` |
| `004_inspections.sql` | Phase 7A | `inspections`, `inspection_items`, `inspection_photos`, `inspection-photos` storage bucket |

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

### After `004_inspections.sql`

**Tables (Table Editor):**
- [ ] `inspections` table exists with all columns
- [ ] `inspection_items` table exists with all columns
- [ ] `inspection_photos` table exists with all columns

**Storage bucket (Storage in Supabase left sidebar):**
- [ ] `inspection-photos` bucket exists
- [ ] Bucket is **private** (lock icon, not a globe icon)
- [ ] File size limit is 50 MB
- [ ] Allowed MIME types include image/jpeg, image/png, image/webp

**RLS (lock icon in Table Editor or Authentication → Policies):**
- [ ] RLS enabled on `inspections`
- [ ] RLS enabled on `inspection_items`
- [ ] RLS enabled on `inspection_photos`

**Table Policies (Authentication → Policies):**
- [ ] `insp: authenticated users can select`
- [ ] `insp: authenticated users can insert`
- [ ] `insp: authenticated users can update`
- [ ] `insp_items: authenticated users can select`
- [ ] `insp_items: authenticated users can insert`
- [ ] `insp_items: authenticated users can update`
- [ ] `insp_photos: authenticated users can select`
- [ ] `insp_photos: authenticated users can insert`
- [ ] `insp_photos: authenticated users can update`
- [ ] No DELETE policies on any inspection table
- [ ] No anon policies on any inspection table

**Storage Policies (Storage → Policies or Authentication → Policies → storage.objects):**
- [ ] `insp-photos storage: authenticated select`
- [ ] `insp-photos storage: authenticated insert`
- [ ] `insp-photos storage: authenticated update`
- [ ] No DELETE storage policy
- [ ] No anon storage policy

**Triggers (Database → Triggers):**
- [ ] `trg_inspections_updated_at` on `inspections`
- [ ] `trg_inspection_items_updated_at` on `inspection_items`
- [ ] No trigger on `inspection_photos` (photos are not edited after upload)

**Indexes (Database → Indexes):**
- [ ] `idx_inspections_repair_order_id`
- [ ] `idx_inspections_status`
- [ ] `idx_inspections_created_at`
- [ ] `idx_insp_items_inspection_id`
- [ ] `idx_insp_items_category`
- [ ] `idx_insp_items_condition`
- [ ] `idx_insp_items_sort_order`
- [ ] `idx_insp_photos_inspection_id`
- [ ] `idx_insp_photos_inspection_item_id`
- [ ] `idx_insp_photos_repair_order_id`
- [ ] `idx_insp_photos_storage_path`
- [ ] `idx_insp_photos_is_active`

**Confirm no public photo access:**
```sql
-- Should return no rows for anon role on these tables
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_name in ('inspections', 'inspection_items', 'inspection_photos')
  and grantee = 'anon';
```
Expected: zero rows.

---

### After `003b_repair_order_sequence_grants.sql`

- [ ] Creating a repair order from the portal generates an RO number without permission errors

---

### After `003_repair_orders.sql`

- [ ] `repair_orders` table exists with all columns

**Verify RO Number Sequence (Database → Sequences):**
- [ ] `repair_order_number_seq` exists

**Verify Trigger (Database → Triggers):**
- [ ] `trg_repair_orders_updated_at` exists on `repair_orders`

**Verify Indexes (Database → Indexes):**
- [ ] `idx_ro_ro_number`
- [ ] `idx_ro_customer_id`
- [ ] `idx_ro_vehicle_id`
- [ ] `idx_ro_appointment_request_id`
- [ ] `idx_ro_status`
- [ ] `idx_ro_payment_status`
- [ ] `idx_ro_created_at`
- [ ] `idx_ro_promised_date`

**Verify Policies (Authentication → Policies):**
- [ ] `ro: authenticated users can select`
- [ ] `ro: authenticated users can insert`
- [ ] `ro: authenticated users can update`
- [ ] No DELETE policy exists
- [ ] No anon/public policy exists

**Verify RLS (Table Editor — lock icon):**
- [ ] RLS is enabled on `repair_orders`

**Verify FK on appointment_requests (Database → Tables → appointment_requests → Foreign Keys):**
- [ ] `appt_repair_order_id_fk` constraint exists linking `appointment_requests.repair_order_id` → `repair_orders.id`

**Verify RO number generation (SQL Editor):**

Run this to create a test row and confirm the RO number format:
```sql
-- Quick test — requires an existing customer and vehicle uuid
-- Replace the UUIDs with real IDs from your customers and vehicles tables
-- DELETE this test row after confirming:
-- DELETE FROM repair_orders WHERE internal_notes = 'migration test row';

-- To just check the sequence and number format without a real row:
select
  'RO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('repair_order_number_seq')::text, 4, '0')
  as next_ro_number;
```
Expected result: `RO-2026-0001` (or similar, depending on how many times the sequence has fired).

**Verify grants (SQL Editor):**
```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'repair_orders'
order by grantee, privilege_type;
```
Expected: `authenticated` has SELECT, INSERT, UPDATE. `anon` has no rows.

---

### After `002b_service_role_grants.sql`

- [ ] `service_role` can insert into `appointment_requests`
- [ ] Public booking form submissions appear in Supabase after running `npx netlify dev`

---

### After `002_appointment_requests.sql`

- [ ] `appointment_requests` table exists with all columns
- [ ] RLS is enabled on `appointment_requests` (lock icon visible in Table Editor)

**Verify Policies (Authentication → Policies):**
- [ ] `appt: authenticated users can select`
- [ ] `appt: authenticated users can insert`
- [ ] `appt: authenticated users can update`
- [ ] No DELETE policy exists
- [ ] No anon/public policy exists

**Verify Trigger (Database → Triggers):**
- [ ] `trg_appt_updated_at` exists on `appointment_requests`

**Verify Indexes (Database → Indexes):**
- [ ] `idx_appt_status`
- [ ] `idx_appt_source`
- [ ] `idx_appt_created_at`
- [ ] `idx_appt_customer_id`
- [ ] `idx_appt_vehicle_id`
- [ ] `idx_appt_phone`
- [ ] `idx_appt_email`

**Verify Grants (Database → Roles or SQL check):**

Run this in SQL Editor to confirm grants and revokes:
```sql
-- Should return rows for authenticated with select/insert/update
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'appointment_requests'
order by grantee, privilege_type;
```
Expected: `authenticated` has SELECT, INSERT, UPDATE. `anon` has no rows.

---

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
