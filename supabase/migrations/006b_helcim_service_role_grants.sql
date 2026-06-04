-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 006b: Service Role Grants for Helcim Netlify Functions
-- =============================================================================
--
-- PURPOSE:
--   Grants the Supabase service_role the privileges needed by the Netlify
--   Functions that handle Helcim invoice creation and payment webhook sync:
--     - helcim-create-invoice.js  (Phase 9C: creates invoice via Helcim API)
--     - helcim-webhook.js         (Phase 9D: processes Helcim payment events)
--     - Any future invoice-related Netlify Functions
--
-- WHY THIS IS NEEDED:
--   These Netlify Functions run server-side using SUPABASE_SERVICE_ROLE_KEY.
--   Without these grants, service_role cannot read/write helcim_invoices
--   even though it bypasses RLS — schema-level grants are still required.
--
-- DEPENDS ON:
--   Migration 006_helcim_invoices.sql must be run first.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard → SQL Editor → New query.
--   2. Paste the entire contents of this file and click Run.
--   3. Run AFTER Phase 9C or 9D Netlify Functions are deployed and configured.
--      Running it earlier is harmless but the functions won't exist yet.
--
-- SAFE TO RE-RUN:
--   GRANT and REVOKE are idempotent.
-- =============================================================================

grant usage on schema public to service_role;

-- Full read/write on Helcim-specific tables
grant select, insert, update on public.helcim_invoices       to service_role;
grant select, insert, update on public.helcim_invoice_items  to service_role;
grant select, insert, update on public.helcim_payment_events to service_role;

-- Read/update on repair orders (webhook needs to update payment_status)
grant select, update on public.repair_orders to service_role;

-- Read-only on context tables (for invoice creation payload)
grant select on public.customers      to service_role;
grant select on public.vehicles       to service_role;
grant select on public.estimates      to service_role;
grant select on public.estimate_items to service_role;

-- Activity log inserts from Helcim webhook events
grant insert on public.activity_logs to service_role;

-- Ensure anon access remains blocked on all Helcim tables
revoke all on public.helcim_invoices       from anon;
revoke all on public.helcim_invoice_items  from anon;
revoke all on public.helcim_payment_events from anon;
