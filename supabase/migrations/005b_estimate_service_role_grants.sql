-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 005b: Service Role Grants for Estimate Approval Functions
-- =============================================================================
--
-- PURPOSE:
--   Grants the Supabase service_role the privileges needed by the three
--   Netlify Functions that handle estimate approval:
--     - send-estimate-approval.js  (staff-triggered, creates token + sends email)
--     - get-approval-estimate.js   (customer-facing, reads estimate data by token)
--     - submit-estimate-approval.js (customer-facing, processes decisions)
--
-- WHY THIS IS NEEDED:
--   These Netlify Functions run server-side using SUPABASE_SERVICE_ROLE_KEY,
--   which authenticates as the service_role Postgres role. Without these grants,
--   service_role cannot read/write the estimate tables even though it bypasses RLS.
--
-- DEPENDS ON:
--   Migration 005_estimates.sql must be run first.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard → SQL Editor → New query.
--   2. Paste the entire contents of this file and click Run.
--   3. Confirm approval flow works by sending a test estimate from the portal.
--
-- SAFE TO RE-RUN:
--   GRANT and REVOKE are idempotent.
-- =============================================================================

grant usage on schema public to service_role;

-- Estimate tables
grant select, insert, update on public.estimates       to service_role;
grant select, insert, update on public.estimate_items  to service_role;
grant select, insert, update on public.approval_tokens to service_role;

-- Read-only access for context (RO, customer, vehicle)
grant select on public.repair_orders to service_role;
grant select on public.customers     to service_role;
grant select on public.vehicles      to service_role;

-- Activity log inserts from submit function
grant select, insert on public.activity_logs to service_role;

-- Sequence (needed if service_role inserts into approval_tokens or estimates directly)
grant usage, select on sequence public.estimate_number_seq to service_role;

-- Ensure anon access remains blocked
revoke all on public.estimates       from anon;
revoke all on public.estimate_items  from anon;
revoke all on public.approval_tokens from anon;
