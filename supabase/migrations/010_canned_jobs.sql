-- Phase 13E: Canned Jobs / Preset Job Bundles
--
-- canned_jobs: named preset bundles of line items (e.g. "Brake Service", "Oil Change")
-- canned_job_items: individual line items belonging to each bundle
--
-- RLS: authenticated staff only. No anon access. No DELETE policy (soft delete via is_active).

-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

create table if not exists canned_jobs (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text        null,
  category    text        null,
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists canned_job_items (
  id                        uuid          primary key default gen_random_uuid(),
  canned_job_id             uuid          not null references canned_jobs(id) on delete cascade,
  item_type                 text          not null default 'labour',
  description               text          not null,
  quantity                  numeric(10,2) not null default 1,
  cost_cents                int4          null
    constraint canned_job_item_cost_check check (cost_cents >= 0),
  markup_percent            numeric(8,2)  null
    constraint canned_job_item_markup_check check (markup_percent >= 0),
  unit_price_cents          int4          not null default 0
    constraint canned_job_item_price_check check (unit_price_cents >= 0),
  customer_unit_price_cents int4          null
    constraint canned_job_item_customer_price_check check (customer_unit_price_cents >= 0),
  is_required               boolean       not null default false,
  is_customer_visible       boolean       not null default true,
  notes                     text          null,
  sort_order                int           not null default 0,
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now()
);

comment on column canned_job_items.cost_cents
  is 'STAFF-ONLY: Internal shop cost per unit in integer cents. Never expose to customers or customer-facing functions.';
comment on column canned_job_items.markup_percent
  is 'STAFF-ONLY: Percentage markup applied to cost_cents to derive unit_price_cents. Never expose to customers.';

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

alter table canned_jobs      enable row level security;
alter table canned_job_items enable row level security;

drop policy if exists "staff_can_read_canned_jobs"        on canned_jobs;
drop policy if exists "staff_can_insert_canned_jobs"      on canned_jobs;
drop policy if exists "staff_can_update_canned_jobs"      on canned_jobs;
drop policy if exists "staff_can_read_canned_job_items"   on canned_job_items;
drop policy if exists "staff_can_insert_canned_job_items" on canned_job_items;
drop policy if exists "staff_can_update_canned_job_items" on canned_job_items;

create policy "staff_can_read_canned_jobs"
  on canned_jobs for select
  using (auth.role() = 'authenticated');

create policy "staff_can_insert_canned_jobs"
  on canned_jobs for insert
  with check (auth.role() = 'authenticated');

create policy "staff_can_update_canned_jobs"
  on canned_jobs for update
  using (auth.role() = 'authenticated');

create policy "staff_can_read_canned_job_items"
  on canned_job_items for select
  using (auth.role() = 'authenticated');

create policy "staff_can_insert_canned_job_items"
  on canned_job_items for insert
  with check (auth.role() = 'authenticated');

create policy "staff_can_update_canned_job_items"
  on canned_job_items for update
  using (auth.role() = 'authenticated');

-- No DELETE policies — use is_active = false for soft deactivation.

-- ─────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists canned_jobs_updated_at      on canned_jobs;
drop trigger if exists canned_job_items_updated_at on canned_job_items;

create trigger canned_jobs_updated_at
  before update on canned_jobs
  for each row execute function set_updated_at();

create trigger canned_job_items_updated_at
  before update on canned_job_items
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_canned_jobs_active_sort
  on canned_jobs (is_active, sort_order);

create index if not exists idx_canned_job_items_job_sort
  on canned_job_items (canned_job_id, sort_order);
S