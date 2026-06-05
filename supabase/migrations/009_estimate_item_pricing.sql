-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 009: Estimate Item Internal Pricing Columns (Phase 13D)
-- =============================================================================
--
-- PURPOSE:
--   Adds three staff-only pricing columns to estimate_items:
--     cost_cents              — internal shop cost per unit (integer cents)
--     markup_percent          — markup percentage applied to cost (numeric)
--     customer_unit_price_cents — final customer-facing unit price (integer cents)
--
-- SECURITY:
--   These columns are STAFF-ONLY. They must NEVER appear in:
--     - get-approval-estimate.js    (uses explicit column select)
--     - send-estimate-approval.js   (uses explicit column select)
--     - submit-estimate-approval.js (uses explicit column select)
--     - helcim-create-invoice.js    (uses explicit column select)
--     - ApprovalPage.jsx            (reads only from get-approval-estimate)
--   All customer-facing functions use explicit SELECT column lists that
--   exclude cost_cents, markup_percent, and customer_unit_price_cents.
--
-- DATA MODEL:
--   - unit_price_cents remains the authoritative customer-facing unit price
--     for all total calculations. customer_unit_price_cents mirrors it.
--   - cost_cents and markup_percent are internal reference values.
--   - If cost_cents and markup_percent are both set, the frontend calculates:
--       customer_unit_price = round(cost_cents × (1 + markup_percent / 100))
--     and stores it in both unit_price_cents and customer_unit_price_cents.
--   - Staff may also set unit_price_cents / customer_unit_price_cents directly.
--
-- RLS:
--   Existing RLS policies on estimate_items allow authenticated staff only.
--   No anon access. These new columns inherit the same policies automatically.
--
-- SAFE TO RE-RUN:
--   Uses ADD COLUMN IF NOT EXISTS — safe to re-run without data loss.
-- =============================================================================


-- Add cost_cents: internal shop cost per unit in integer cents.
-- Staff-only. Never shown to customers or in customer-facing API responses.
alter table estimate_items
  add column if not exists cost_cents int4 null
    constraint estimate_item_cost_cents_check check (cost_cents >= 0);

comment on column estimate_items.cost_cents
  is 'STAFF-ONLY: Internal shop cost per unit in integer cents. Never expose to customers, approval emails, or customer-facing functions.';


-- Add markup_percent: percentage markup applied to cost_cents to derive customer price.
-- Staff-only. Never shown to customers or in customer-facing API responses.
alter table estimate_items
  add column if not exists markup_percent numeric(8,2) null
    constraint estimate_item_markup_percent_check check (markup_percent >= 0);

comment on column estimate_items.markup_percent
  is 'STAFF-ONLY: Markup percentage (e.g. 30.00 = 30%) applied to cost_cents to calculate customer price. Never expose to customers.';


-- Add customer_unit_price_cents: final customer-facing unit price in integer cents.
-- Mirrors unit_price_cents. Stored explicitly for clarity and potential future divergence.
alter table estimate_items
  add column if not exists customer_unit_price_cents int4 null
    constraint estimate_item_customer_unit_price_check check (customer_unit_price_cents >= 0);

comment on column estimate_items.customer_unit_price_cents
  is 'Customer-facing unit price in integer cents. Mirrors unit_price_cents. Calculated as round(cost_cents * (1 + markup_percent/100)) when cost and markup are set, or entered directly by staff.';


-- =============================================================================
-- END OF MIGRATION 009
-- =============================================================================
-- Modified:
--   estimate_items: added cost_cents, markup_percent, customer_unit_price_cents
--
-- No new tables. No new sequences. No RLS policy changes.
-- Existing authenticated staff policies cover the new columns automatically.
--
-- Depends on migration 005 (estimate_items table).
-- =============================================================================
