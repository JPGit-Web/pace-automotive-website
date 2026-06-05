-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 011: Estimate Job Groups
-- =============================================================================
--
-- PURPOSE:
--   Adds estimate_jobs table so estimate line items can be grouped into
--   named sections (one per repair concern or a manual heading). Each job
--   can optionally map back to a repair_order_concern for traceability.
--   estimate_items gains an estimate_job_id foreign key so items are
--   assigned to a job section; null means "ungrouped."
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard → SQL Editor → New query.
--   2. Paste this file and click Run.
--   IMPORTANT: Migrations 001–010 must be run first.
--
-- DESIGN NOTES:
--   - Soft-delete with is_active = false instead of physical deletion.
--   - When a job is soft-deleted, its items keep estimate_job_id intact;
--     the UI treats those items as ungrouped (job not in active list).
--   - No DELETE policy — records are hidden via is_active = false.
--   - estimate_job_id ON DELETE SET NULL so hiding/removing a job row
--     never cascades to hide its items.
--
-- SECURITY:
--   - RLS is enabled. Only authenticated staff can access.
--   - No anon policies. Customer approval access is server-side only.
--
-- SAFE TO RE-RUN:
--   - create table if not exists
--   - alter table ... add column if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
-- =============================================================================


-- =============================================================================
-- TABLE: estimate_jobs
-- =============================================================================
-- Groups line items within an estimate into named sections.
-- Typically one job = one repair concern, but staff can add manual jobs.

create table if not exists estimate_jobs (
  id                      uuid primary key default gen_random_uuid(),
  estimate_id             uuid not null references estimates (id) on delete cascade,

  -- Optional back-link to the RO concern that seeded this job
  repair_order_concern_id uuid null references repair_order_concerns (id) on delete set null,

  -- Display title shown to staff and on customer approval page
  title                   text not null default 'Job',

  -- Internal staff notes — never shown to customers
  notes                   text null,

  sort_order              integer not null default 0,
  is_active               boolean not null default true,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists trg_estimate_jobs_updated_at on estimate_jobs;
create trigger trg_estimate_jobs_updated_at
  before update on estimate_jobs
  for each row
  execute function set_updated_at();

create index if not exists idx_est_jobs_estimate_id        on estimate_jobs (estimate_id, sort_order);
create index if not exists idx_est_jobs_concern_id         on estimate_jobs (repair_order_concern_id);
create index if not exists idx_est_jobs_is_active          on estimate_jobs (estimate_id, is_active);


-- =============================================================================
-- ALTER: estimate_items — add estimate_job_id column
-- =============================================================================
-- null means the item is ungrouped (no job section assigned).
-- ON DELETE SET NULL: hiding a job never cascades to hide its items.

alter table estimate_items
  add column if not exists estimate_job_id uuid null
    references estimate_jobs (id) on delete set null;

create index if not exists idx_est_items_job_id on estimate_items (estimate_job_id);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table estimate_jobs enable row level security;

drop policy if exists "est_jobs: authenticated users can select" on estimate_jobs;
create policy "est_jobs: authenticated users can select"
  on estimate_jobs for select to authenticated using (true);

drop policy if exists "est_jobs: authenticated users can insert" on estimate_jobs;
create policy "est_jobs: authenticated users can insert"
  on estimate_jobs for insert to authenticated with check (true);

drop policy if exists "est_jobs: authenticated users can update" on estimate_jobs;
create policy "est_jobs: authenticated users can update"
  on estimate_jobs for update to authenticated using (true) with check (true);

-- No DELETE policy. Use is_active = false to soft-delete.


-- =============================================================================
-- GRANTS AND REVOKES
-- =============================================================================

grant usage on schema public to authenticated;
grant select, insert, update on table public.estimate_jobs to authenticated;
revoke all on table public.estimate_jobs from anon;

-- Service role access (bypasses RLS — needed by Netlify Functions)
grant all on table public.estimate_jobs to service_role;


-- =============================================================================
-- END OF MIGRATION 011
-- =============================================================================
-- Created:
--   estimate_jobs         — job section table with optional concern back-link
--   estimate_items.estimate_job_id — FK grouping items into job sections
--
-- Depends on:
--   migration 005 — estimates, estimate_items tables
--   migration 008 — repair_order_concerns table (FK reference)
--   migration 001 — set_updated_at() trigger function
-- =============================================================================
