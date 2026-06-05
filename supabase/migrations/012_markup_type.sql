-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 012: Markup Type + Fixed Dollar Markup (Phase 15A)
-- =============================================================================
--
-- PURPOSE:
--   Extends the staff-only pricing model to support two markup modes:
--
--     markup_type = 'percent'  →  customer_price = cost × (1 + markup_percent / 100)
--     markup_type = 'fixed'    →  customer_price = cost + markup_value_cents
--
--   Both columns are added to estimate_items and canned_job_items.
--
-- SECURITY:
--   markup_type and markup_value_cents are STAFF-ONLY internal pricing fields.
--   They must NEVER appear in:
--     - get-approval-estimate.js    (uses explicit column allowlist)
--     - send-estimate-approval.js   (uses explicit column allowlist)
--     - submit-estimate-approval.js (uses explicit column allowlist)
--     - helcim-create-invoice.js    (uses explicit column allowlist)
--     - ApprovalPage.jsx            (reads only from get-approval-estimate)
--   All customer-facing functions use explicit SELECT column lists that
--   already exclude cost_cents, markup_percent, customer_unit_price_cents,
--   and by extension these new columns.
--
-- DATA COMPATIBILITY:
--   - Existing rows default to markup_type = 'percent' — no behavior change.
--   - markup_value_cents defaults to null (not used for percent markup).
--   - Existing percentage markup calculations continue unchanged.
--
-- RLS:
--   Existing RLS policies on estimate_items / canned_job_items allow
--   authenticated staff only (no anon access). New columns inherit
--   those policies automatically.
--
-- SAFE TO RE-RUN:
--   Uses ADD COLUMN IF NOT EXISTS — safe to re-run without data loss.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────
-- estimate_items
-- ─────────────────────────────────────────────────────────────

alter table estimate_items
  add column if not exists markup_type text not null default 'percent'
    constraint estimate_item_markup_type_check check (markup_type in ('percent', 'fixed'));

comment on column estimate_items.markup_type
  is 'STAFF-ONLY: Markup calculation mode. ''percent'' uses markup_percent; ''fixed'' uses markup_value_cents. Never expose to customers.';

alter table estimate_items
  add column if not exists markup_value_cents int4 null
    constraint estimate_item_markup_value_check check (markup_value_cents >= 0);

comment on column estimate_items.markup_value_cents
  is 'STAFF-ONLY: Fixed dollar markup in integer cents (used when markup_type = ''fixed''). Null when markup_type = ''percent''. Never expose to customers.';


-- ─────────────────────────────────────────────────────────────
-- canned_job_items
-- ─────────────────────────────────────────────────────────────

alter table canned_job_items
  add column if not exists markup_type text not null default 'percent'
    constraint canned_job_item_markup_type_check check (markup_type in ('percent', 'fixed'));

comment on column canned_job_items.markup_type
  is 'STAFF-ONLY: Markup calculation mode. ''percent'' uses markup_percent; ''fixed'' uses markup_value_cents. Never expose to customers.';

alter table canned_job_items
  add column if not exists markup_value_cents int4 null
    constraint canned_job_item_markup_value_check check (markup_value_cents >= 0);

comment on column canned_job_items.markup_value_cents
  is 'STAFF-ONLY: Fixed dollar markup in integer cents (used when markup_type = ''fixed''). Null when markup_type = ''percent''. Never expose to customers.';


-- =============================================================================
-- END OF MIGRATION 012
-- =============================================================================
-- Modified tables:
--   estimate_items:   added markup_type, markup_value_cents
--   canned_job_items: added markup_type, markup_value_cents
--
-- No new tables. No new sequences. No RLS policy changes needed.
-- Existing authenticated staff policies cover the new columns automatically.
--
-- Depends on migration 005 (estimate_items), 009 (estimate item pricing),
-- and migration 010 (canned_job_items).
-- =============================================================================
