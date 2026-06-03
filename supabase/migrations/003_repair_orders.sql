-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 003: Repair Orders
-- =============================================================================
--
-- PURPOSE:
--   Creates the repair_orders table — the central shop workflow record for
--   the P.A.C.E. staff portal. Every vehicle job flows through a repair order.
--   This migration also wires the foreign key from appointment_requests to
--   repair_orders so appointments can be converted into ROs.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm the table appears in Table Editor before proceeding.
--   IMPORTANT: Migrations 001 and 002 must be run first.
--     - customers, vehicles, activity_logs, set_updated_at() → migration 001
--     - appointment_requests → migration 002
--
-- DESIGN NOTES:
--   - Repair orders are the central record for all shop work.
--   - Every RO links to exactly one customer and one vehicle.
--   - An RO may optionally link to the appointment request that created it.
--   - Status progresses through a defined workflow; no physical deletion.
--   - Cancelled ROs use status = 'cancelled', not a DELETE.
--   - RO numbers are human-readable (e.g. RO-2026-0001) using a sequence.
--   - Later phases will add: inspections, estimates, and invoices as child
--     records of repair orders.
--   - Helcim invoice ID and payment link are stored as external references
--     only. No payment card data is stored here.
--
-- SECURITY:
--   - RLS is enabled on repair_orders.
--   - Only authenticated staff can access this table.
--   - No delete policies are created.
--   - Never paste a Supabase service role key into frontend code (src/).
--   - Frontend uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- SAFE TO RE-RUN:
--   - create sequence if not exists
--   - create table if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
--   - FK constraint uses DO block to skip if already exists
--   - Will not drop or modify existing data
-- =============================================================================


-- =============================================================================
-- SEQUENCE: repair order number counter
-- =============================================================================
-- Used to generate the numeric portion of human-readable RO numbers.
-- The sequence is global and increments regardless of year. The year is
-- added in the default expression so RO-2025-0099 and RO-2026-0001 are
-- both unique even though they share the same sequence range.

create sequence if not exists repair_order_number_seq
  start 1
  increment 1
  minvalue 1
  no maxvalue
  cache 1;


-- =============================================================================
-- TABLE: repair_orders
-- =============================================================================
-- Central workflow record for every job performed in the shop.
-- Each RO belongs to one customer and one vehicle.
-- Status tracks the job through its lifecycle from intake to close.

create table if not exists repair_orders (
  id                     uuid    primary key default gen_random_uuid(),

  -- Human-readable RO number: RO-YYYY-NNNN
  -- Generated from the current year and the global sequence.
  -- Example: RO-2026-0001, RO-2026-0002, ...
  ro_number              text    not null unique
                         default (
                           'RO-'
                           || to_char(now(), 'YYYY')
                           || '-'
                           || lpad(nextval('repair_order_number_seq')::text, 4, '0')
                         ),

  -- Required links to customer and vehicle.
  -- on delete restrict prevents orphaning an RO if the customer or vehicle
  -- record is somehow removed; use soft deletes (is_active = false) instead.
  customer_id            uuid    not null references customers (id) on delete restrict,
  vehicle_id             uuid    not null references vehicles (id)  on delete restrict,

  -- Optional link to the appointment request that originated this RO.
  -- Nullable: ROs can be created directly without an appointment request.
  appointment_request_id uuid    null references appointment_requests (id) on delete set null,

  -- Workflow status. Progresses forward; never physically deleted.
  status                 text    not null default 'draft',

  -- Odometer readings recorded at drop-off and pick-up.
  mileage_in             integer null,
  mileage_out            integer null,

  -- Date the vehicle is promised back to the customer.
  promised_date          date    null,

  -- 3-C fields (customer concern, cause, correction) — standard RO format.
  customer_concern       text    null,
  cause                  text    null,
  correction             text    null,

  -- Internal staff-only notes not shown to the customer.
  internal_notes         text    null,

  -- Helcim payment references — external IDs only, no card data stored here.
  helcim_invoice_id      text    null,
  helcim_payment_link    text    null,
  payment_status         text    not null default 'unpaid',

  -- Staff user who created this RO. References auth.users directly for MVP.
  -- A staff_users profile table will be added in a future phase.
  created_by             uuid    null references auth.users (id) on delete set null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Status must follow the defined repair order workflow.
  constraint ro_status_check check (
    status in (
      'draft', 'active', 'waiting_approval', 'approved',
      'in_progress', 'completed', 'invoiced', 'closed', 'cancelled'
    )
  ),

  -- Payment status mirrors what Helcim reports.
  constraint ro_payment_status_check check (
    payment_status in ('unpaid', 'partial', 'paid')
  ),

  -- Mileage readings must be non-negative when provided.
  constraint ro_mileage_in_check  check (mileage_in  is null or mileage_in  >= 0),
  constraint ro_mileage_out_check check (mileage_out is null or mileage_out >= 0)
);


-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
-- Reuses the set_updated_at() function created in migration 001.

drop trigger if exists trg_repair_orders_updated_at on repair_orders;
create trigger trg_repair_orders_updated_at
  before update on repair_orders
  for each row
  execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Tuned for the most common portal queries: list by status, look up by
-- customer or vehicle, sort by date, and fetch by RO number.

create index if not exists idx_ro_ro_number              on repair_orders (ro_number);
create index if not exists idx_ro_customer_id            on repair_orders (customer_id);
create index if not exists idx_ro_vehicle_id             on repair_orders (vehicle_id);
create index if not exists idx_ro_appointment_request_id on repair_orders (appointment_request_id);
create index if not exists idx_ro_status                 on repair_orders (status);
create index if not exists idx_ro_payment_status         on repair_orders (payment_status);
create index if not exists idx_ro_created_at             on repair_orders (created_at);
create index if not exists idx_ro_promised_date          on repair_orders (promised_date);


-- =============================================================================
-- FOREIGN KEY: appointment_requests → repair_orders
-- =============================================================================
-- appointment_requests.repair_order_id was added in migration 002 as a plain
-- uuid column without a FK constraint because repair_orders did not yet exist.
-- Now that repair_orders exists, add the constraint.
--
-- The DO block checks whether the constraint already exists before adding it,
-- making this safe to re-run without errors.

do $$
begin
  if not exists (
    select 1
    from   information_schema.table_constraints
    where  constraint_name = 'appt_repair_order_id_fk'
    and    table_name      = 'appointment_requests'
  ) then
    alter table appointment_requests
      add constraint appt_repair_order_id_fk
      foreign key (repair_order_id)
      references repair_orders (id)
      on delete set null;
  end if;
end;
$$;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- RLS is enabled. Default deny-all. Only authenticated staff can access.
-- Anonymous access is blocked by policy absence and explicit REVOKE.

alter table repair_orders enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: repair_orders
-- ---------------------------------------------------------------------------
-- MVP: any authenticated Supabase user (staff login) can read and write.
-- Future: tighten to specific staff roles (owner, technician) in a later phase
--         once the staff_users profile table and roles are implemented.
-- Pattern: DROP IF EXISTS then CREATE — works on all Postgres/Supabase versions.
-- NOTE: do NOT use "create policy if not exists" — not valid Postgres syntax.

drop policy if exists "ro: authenticated users can select" on repair_orders;
create policy "ro: authenticated users can select"
  on repair_orders
  for select
  to authenticated
  using (true);

drop policy if exists "ro: authenticated users can insert" on repair_orders;
create policy "ro: authenticated users can insert"
  on repair_orders
  for insert
  to authenticated
  with check (true);

drop policy if exists "ro: authenticated users can update" on repair_orders;
create policy "ro: authenticated users can update"
  on repair_orders
  for update
  to authenticated
  using (true)
  with check (true);

-- No DELETE policy.
-- Use status = 'cancelled' to close out an RO without physical deletion.


-- =============================================================================
-- EXPLICIT GRANTS AND REVOKES
-- =============================================================================
-- Grants the authenticated role the operations covered by RLS policies above.
-- Revokes anon access explicitly to harden against misconfiguration.

grant usage on schema public to authenticated;
grant select, insert, update on table public.repair_orders to authenticated;
revoke all on table public.repair_orders from anon;


-- =============================================================================
-- END OF MIGRATION 003
-- =============================================================================
-- Created:
--   repair_order_number_seq  — counter for human-readable RO numbers
--   repair_orders            — central shop workflow table with RLS, trigger, indexes
--
-- Modified:
--   appointment_requests     — added FK constraint on repair_order_id → repair_orders.id
--
-- Depends on migration 001:
--   customers table (FK reference)
--   vehicles table (FK reference)
--   set_updated_at() function (trigger reuse)
--
-- Depends on migration 002:
--   appointment_requests table (FK constraint added above)
--
-- Next migration: 004_inspections.sql (Phase 7)
--   Will add: inspections, inspection_items, inspection_photos tables
-- =============================================================================
