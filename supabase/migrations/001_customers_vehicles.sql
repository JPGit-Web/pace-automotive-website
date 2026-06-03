-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 001: Customers, Vehicles, and Activity Logs
-- =============================================================================
--
-- PURPOSE:
--   Sets up the core customer and vehicle record tables for the P.A.C.E. staff
--   portal, along with the activity_logs table for audit trails.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm tables appear in Table Editor before proceeding.
--
-- DESIGN NOTES:
--   - Row Level Security (RLS) is enabled on all tables.
--   - MVP policies allow any authenticated Supabase user full read/write access.
--     These will be tightened in a future phase when staff roles are introduced.
--   - No DELETE policies are created. The portal uses soft deletes (is_active = false).
--     Hard deletes are not supported through the portal UI.
--   - activity_logs is append-only. No update or delete policies are added.
--
-- SECURITY:
--   - Never paste a Supabase service role key into frontend code (src/).
--   - Frontend uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--   - The service role key belongs only in Netlify environment variables
--     for use by Netlify Functions (server-side only).
--
-- SAFE TO RE-RUN:
--   This script uses IF NOT EXISTS guards and is safe to run more than once.
--   It will not drop or modify existing data.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------

-- pgcrypto provides gen_random_uuid() for generating UUID primary keys.
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER FUNCTION
-- ---------------------------------------------------------------------------
-- A single reusable trigger function that sets updated_at = now() on every
-- row update. Attached to customers and vehicles tables below.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- TABLE: customers
-- =============================================================================
-- Stores all customer contact records for the P.A.C.E. shop.
-- Vehicles, repair orders, and approval tokens are linked to this table.
-- Soft-deleted records use is_active = false and are not shown in the portal UI.

create table if not exists customers (
  id               uuid        primary key default gen_random_uuid(),
  first_name       text        not null,
  last_name        text        not null,
  email            text        null,
  phone            text        null,
  preferred_contact text       not null default 'phone',
  address          text        null,
  city             text        null,
  province         text        not null default 'AB',
  postal_code      text        null,
  notes            text        null,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- preferred_contact must be one of the four supported values.
  -- 'email_and_text' is stored for future SMS phase support.
  constraint customers_preferred_contact_check
    check (preferred_contact in ('phone', 'email', 'text', 'email_and_text'))
);

-- Trigger: auto-update updated_at on any row change
drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
  before update on customers
  for each row
  execute function set_updated_at();

-- Indexes for common lookups and filtering
create index if not exists idx_customers_last_name  on customers (last_name);
create index if not exists idx_customers_email      on customers (email);
create index if not exists idx_customers_phone      on customers (phone);
create index if not exists idx_customers_is_active  on customers (is_active);


-- =============================================================================
-- TABLE: vehicles
-- =============================================================================
-- Each vehicle belongs to one customer. A customer may have multiple vehicles.
-- Vehicles are soft-deleted (is_active = false), not hard-deleted.

create table if not exists vehicles (
  id             uuid        primary key default gen_random_uuid(),
  customer_id    uuid        not null references customers (id) on delete cascade,
  year           integer     null,
  make           text        not null,
  model          text        not null,
  trim           text        null,
  color          text        null,
  vin            text        null,
  license_plate  text        null,
  plate_province text        not null default 'AB',
  notes          text        null,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Year must be a plausible vehicle model year if provided.
  constraint vehicles_year_check
    check (year is null or (year >= 1900 and year <= 2100)),

  -- VIN is a 17-character standard. Allow null for vehicles where VIN is unknown.
  constraint vehicles_vin_length_check
    check (vin is null or length(vin) <= 17)
);

-- Trigger: auto-update updated_at on any row change
drop trigger if exists trg_vehicles_updated_at on vehicles;
create trigger trg_vehicles_updated_at
  before update on vehicles
  for each row
  execute function set_updated_at();

-- Indexes for common lookups and filtering
create index if not exists idx_vehicles_customer_id    on vehicles (customer_id);
create index if not exists idx_vehicles_make           on vehicles (make);
create index if not exists idx_vehicles_model          on vehicles (model);
create index if not exists idx_vehicles_vin            on vehicles (vin);
create index if not exists idx_vehicles_license_plate  on vehicles (license_plate);
create index if not exists idx_vehicles_is_active      on vehicles (is_active);


-- =============================================================================
-- TABLE: activity_logs
-- =============================================================================
-- Append-only audit trail of staff actions in the portal.
-- Rows are never updated or deleted — they are permanent records.
-- staff_user_id references auth.users so it can be null for system actions.

create table if not exists activity_logs (
  id             uuid        primary key default gen_random_uuid(),
  staff_user_id  uuid        null references auth.users (id) on delete set null,
  action         text        not null,
  entity_type    text        not null,
  entity_id      uuid        null,
  details        jsonb       null,
  ip_address     text        null,
  created_at     timestamptz not null default now()

  -- No updated_at — logs are immutable.
);

-- Indexes for filtering and audit lookups
create index if not exists idx_activity_logs_entity   on activity_logs (entity_type, entity_id);
create index if not exists idx_activity_logs_created  on activity_logs (created_at);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- RLS is enabled on all three tables. Default behavior with RLS on is to deny
-- all access. Explicit policies below grant the minimum required access.
-- Anonymous/public access is never granted.

alter table customers     enable row level security;
alter table vehicles      enable row level security;
alter table activity_logs enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: customers
-- ---------------------------------------------------------------------------
-- MVP: any authenticated Supabase user (staff login) can read and write.
-- Future: tighten to specific roles (owner, technician) in a later phase.
-- Pattern: DROP IF EXISTS then CREATE — works on all Postgres/Supabase versions.

drop policy if exists "customers: authenticated users can select" on customers;
create policy "customers: authenticated users can select"
  on customers
  for select
  to authenticated
  using (true);

drop policy if exists "customers: authenticated users can insert" on customers;
create policy "customers: authenticated users can insert"
  on customers
  for insert
  to authenticated
  with check (true);

drop policy if exists "customers: authenticated users can update" on customers;
create policy "customers: authenticated users can update"
  on customers
  for update
  to authenticated
  using (true)
  with check (true);

-- No DELETE policy. Use is_active = false for soft deletes.


-- ---------------------------------------------------------------------------
-- POLICIES: vehicles
-- ---------------------------------------------------------------------------
-- MVP: any authenticated Supabase user can read and write.
-- Future: tighten to specific roles in a later phase.

drop policy if exists "vehicles: authenticated users can select" on vehicles;
create policy "vehicles: authenticated users can select"
  on vehicles
  for select
  to authenticated
  using (true);

drop policy if exists "vehicles: authenticated users can insert" on vehicles;
create policy "vehicles: authenticated users can insert"
  on vehicles
  for insert
  to authenticated
  with check (true);

drop policy if exists "vehicles: authenticated users can update" on vehicles;
create policy "vehicles: authenticated users can update"
  on vehicles
  for update
  to authenticated
  using (true)
  with check (true);

-- No DELETE policy. Use is_active = false for soft deletes.


-- ---------------------------------------------------------------------------
-- POLICIES: activity_logs
-- ---------------------------------------------------------------------------
-- Authenticated users can read all logs and insert new log entries.
-- No update or delete policies — logs are immutable.

drop policy if exists "activity_logs: authenticated users can select" on activity_logs;
create policy "activity_logs: authenticated users can select"
  on activity_logs
  for select
  to authenticated
  using (true);

drop policy if exists "activity_logs: authenticated users can insert" on activity_logs;
create policy "activity_logs: authenticated users can insert"
  on activity_logs
  for insert
  to authenticated
  with check (true);

-- No UPDATE policy.
-- No DELETE policy.
-- Logs are permanent and append-only.


-- =============================================================================
-- END OF MIGRATION 001
-- =============================================================================
-- Tables created or confirmed:
--   customers     — with updated_at trigger, RLS, indexes
--   vehicles      — with updated_at trigger, RLS, indexes
--   activity_logs — append-only, RLS, indexes
--
-- Next migration: 002_appointment_requests.sql (Phase 5)
-- =============================================================================
