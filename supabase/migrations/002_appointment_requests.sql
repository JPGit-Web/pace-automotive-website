-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 002: Appointment Requests
-- =============================================================================
--
-- PURPOSE:
--   Sets up the appointment_requests table for the P.A.C.E. staff portal.
--   This table stores requests submitted through the public booking form as
--   well as requests entered manually by staff (phone, walk-in).
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm the table appears in Table Editor before proceeding.
--   IMPORTANT: Migration 001 must be run first (customers, vehicles,
--   activity_logs, and the set_updated_at() function must already exist).
--
-- DESIGN NOTES:
--   - RLS is enabled on appointment_requests.
--   - Only authenticated staff users can access this table directly.
--   - Anonymous/public users do NOT get table access. Public booking form
--     submissions will be handled through a Netlify Function (server-side)
--     using the Supabase service role key — not via direct client access.
--   - No DELETE policies are created. Records are not removed.
--     Status changes ('cancelled', 'converted') replace physical deletion.
--   - The set_updated_at() function was created in migration 001.
--     This migration reuses it via a new trigger on appointment_requests.
--
-- SECURITY:
--   - Never paste a Supabase service role key into frontend code (src/).
--   - Frontend uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--   - The service role key belongs only in Netlify environment variables
--     for server-side Netlify Functions.
--   - anon role is explicitly revoked from this table.
--
-- SAFE TO RE-RUN:
--   Uses IF NOT EXISTS for table and indexes.
--   Uses DROP POLICY IF EXISTS before CREATE POLICY.
--   Will not drop or modify existing data.
-- =============================================================================


-- =============================================================================
-- TABLE: appointment_requests
-- =============================================================================
-- Stores all appointment requests regardless of source.
-- Web form submissions initially have no customer_id or vehicle_id — staff
-- links these manually after identifying the customer in the portal.
-- Phone and walk-in requests are entered directly by staff.
-- When converted to a repair order, status becomes 'converted' and
-- repair_order_id is set.

create table if not exists appointment_requests (
  id               uuid        primary key default gen_random_uuid(),

  -- Optional links to known customer and vehicle records.
  -- NULL is expected for new web form submissions until staff links them.
  customer_id      uuid        null references customers (id) on delete set null,
  vehicle_id       uuid        null references vehicles (id)  on delete set null,

  -- How the request came in.
  source           text        not null default 'web_form',

  -- Contact info — carried from the form or entered by staff.
  -- name and phone are required; email is optional.
  name             text        not null,
  email            text        null,
  phone            text        not null,

  -- Vehicle and service details (free-text from public form or staff entry).
  vehicle_info     text        null,
  service_requested text       null,
  preferred_date   text        null,
  notes            text        null,

  -- Workflow status.
  status           text        not null default 'pending',

  -- Set when this request is converted to a repair order.
  -- repair_orders table does not exist yet; stored as unvalidated uuid for now.
  -- A foreign key constraint will be added in migration 003.
  repair_order_id  uuid        null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- source must be one of the three accepted intake channels.
  constraint appt_source_check
    check (source in ('web_form', 'phone', 'walk_in')),

  -- status must follow the defined workflow states.
  constraint appt_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'converted'))
);


-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
-- Reuses the set_updated_at() function created in migration 001.

drop trigger if exists trg_appt_updated_at on appointment_requests;
create trigger trg_appt_updated_at
  before update on appointment_requests
  for each row
  execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Tuned for common staff queries: filter by status, look up by phone,
-- and sort/filter by date.

create index if not exists idx_appt_status      on appointment_requests (status);
create index if not exists idx_appt_source      on appointment_requests (source);
create index if not exists idx_appt_created_at  on appointment_requests (created_at);
create index if not exists idx_appt_customer_id on appointment_requests (customer_id);
create index if not exists idx_appt_vehicle_id  on appointment_requests (vehicle_id);
create index if not exists idx_appt_phone       on appointment_requests (phone);
create index if not exists idx_appt_email       on appointment_requests (email);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- RLS is enabled. Default deny-all. Explicit policies below grant access
-- only to authenticated staff users.
-- Anonymous access is explicitly blocked by policy absence and by REVOKE.

alter table appointment_requests enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: appointment_requests
-- ---------------------------------------------------------------------------
-- MVP: any authenticated Supabase user (staff login) can read and write.
-- Future: tighten to specific staff roles in a later phase.
-- Pattern: DROP IF EXISTS then CREATE — works on all Postgres/Supabase versions.
-- NOTE: do NOT use "create policy if not exists" — not valid Postgres syntax.

drop policy if exists "appt: authenticated users can select" on appointment_requests;
create policy "appt: authenticated users can select"
  on appointment_requests
  for select
  to authenticated
  using (true);

drop policy if exists "appt: authenticated users can insert" on appointment_requests;
create policy "appt: authenticated users can insert"
  on appointment_requests
  for insert
  to authenticated
  with check (true);

drop policy if exists "appt: authenticated users can update" on appointment_requests;
create policy "appt: authenticated users can update"
  on appointment_requests
  for update
  to authenticated
  using (true)
  with check (true);

-- No DELETE policy.
-- Cancelled or converted requests remain in the table with updated status.
-- Physical deletion is not supported through the portal.


-- =============================================================================
-- EXPLICIT GRANTS AND REVOKES
-- =============================================================================
-- Supabase does not automatically expose new tables to all roles.
-- These grants ensure the authenticated role has the exact access it needs.
-- The anon role is explicitly revoked to harden against any misconfiguration.

-- Ensure authenticated users can use the public schema
grant usage on schema public to authenticated;

-- Grant only the operations we have policies for
grant select, insert, update on table public.appointment_requests to authenticated;

-- Explicitly block anonymous (public) access to this table.
-- Public booking form submissions must go through a Netlify Function
-- using the service role key — not directly from the browser.
revoke all on table public.appointment_requests from anon;


-- =============================================================================
-- END OF MIGRATION 002
-- =============================================================================
-- Tables created or confirmed:
--   appointment_requests — with updated_at trigger, RLS, indexes, grants
--
-- Depends on migration 001:
--   - customers table (FK reference)
--   - vehicles table (FK reference)
--   - set_updated_at() function (trigger reuse)
--
-- Next migration: 003_repair_orders.sql (Phase 6)
-- repair_order_id FK constraint will be added in migration 003
-- when the repair_orders table is created.
-- =============================================================================
