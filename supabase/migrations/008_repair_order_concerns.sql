-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 008: Repair Order Concerns (Multiple Customer Concerns)
-- =============================================================================
--
-- PURPOSE:
--   Replaces the single repair_orders.customer_concern text field with a
--   structured list of individual concern rows, one per issue reported.
--   The existing customer_concern column is kept for backwards compatibility.
--   Older ROs without concern rows fall back to displaying customer_concern.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard → SQL Editor → New query.
--   2. Paste this file and click Run.
--   IMPORTANT: Migrations 001–006 must be run first.
--
-- DESIGN NOTES:
--   - Soft-delete with is_active = false instead of physical deletion.
--   - No DELETE policy — records are hidden by setting is_active = false.
--   - repair_orders.customer_concern is kept for backwards compat. When new
--     concerns are created, the first concern text is also written there.
--
-- SECURITY:
--   - RLS is enabled.
--   - Only authenticated staff can access.
--   - No anon policies.
--
-- SAFE TO RE-RUN:
--   - create table if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
-- =============================================================================

create table if not exists repair_order_concerns (
  id              uuid    primary key default gen_random_uuid(),
  repair_order_id uuid    not null references repair_orders (id) on delete cascade,
  concern_text    text    not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Trigger: auto-update updated_at
drop trigger if exists trg_ro_concerns_updated_at on repair_order_concerns;
create trigger trg_ro_concerns_updated_at
  before update on repair_order_concerns
  for each row
  execute function set_updated_at();

-- Indexes
create index if not exists idx_ro_concerns_repair_order_id on repair_order_concerns (repair_order_id);
create index if not exists idx_ro_concerns_is_active       on repair_order_concerns (repair_order_id, is_active);
create index if not exists idx_ro_concerns_sort_order      on repair_order_concerns (repair_order_id, sort_order);

-- RLS
alter table repair_order_concerns enable row level security;

drop policy if exists "ro_concerns: authenticated users can select" on repair_order_concerns;
create policy "ro_concerns: authenticated users can select"
  on repair_order_concerns for select to authenticated using (true);

drop policy if exists "ro_concerns: authenticated users can insert" on repair_order_concerns;
create policy "ro_concerns: authenticated users can insert"
  on repair_order_concerns for insert to authenticated with check (true);

drop policy if exists "ro_concerns: authenticated users can update" on repair_order_concerns;
create policy "ro_concerns: authenticated users can update"
  on repair_order_concerns for update to authenticated using (true) with check (true);

-- No DELETE policy. Use is_active = false to hide a concern.

-- Grants
grant usage on schema public to authenticated;
grant select, insert, update on public.repair_order_concerns to authenticated;
revoke all on public.repair_order_concerns from anon;

-- =============================================================================
-- END OF MIGRATION 008
-- =============================================================================
-- Table created: repair_order_concerns
-- Depends on: repair_orders (migration 003), set_updated_at() (migration 001)
-- Next: Phase 13B frontend (multiple concerns UI in repair order modal)
-- =============================================================================
