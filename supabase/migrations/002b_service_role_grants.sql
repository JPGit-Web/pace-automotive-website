-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 002b: Service Role Grants for appointment_requests
-- =============================================================================
--
-- PURPOSE:
--   Grants the Supabase service_role the privileges it needs to insert
--   appointment requests from the Netlify Function (send-inquiry.js).
--
-- WHY THIS IS NEEDED:
--   Public booking form submissions are NOT sent directly to Supabase from
--   the browser. They go through a Netlify Function (server-side) which
--   authenticates using the Supabase secret key (SUPABASE_SERVICE_ROLE_KEY).
--   That key runs as the service_role in Postgres, not as authenticated or
--   anon. Without these grants, service_role has no permission to write to
--   the appointment_requests table.
--
-- DEPENDS ON:
--   Migration 002_appointment_requests.sql must be run first.
--   The appointment_requests table must already exist.
--
-- SECURITY:
--   - service_role bypasses RLS by design — it is a trusted server-side role.
--   - SUPABASE_SERVICE_ROLE_KEY must never appear in frontend code (src/).
--   - It belongs only in Netlify environment variables, used by the function.
--   - anon (public browser) access remains explicitly revoked.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard → SQL Editor → New query.
--   2. Paste the entire contents of this file and click Run.
--   3. Confirm in the terminal that the Netlify Function can now insert rows.
--
-- SAFE TO RE-RUN:
--   GRANT and REVOKE are idempotent — re-running will not cause errors.
-- =============================================================================


-- Allow service_role to use the public schema.
-- Required before any table-level grants can be used.
grant usage on schema public to service_role;

-- Grant the exact operations the Netlify Function needs on this table.
-- insert: public booking form submissions via send-inquiry.js
-- select: future functions that may read appointment data server-side
-- update: future functions that may update status server-side
grant select, insert, update on public.appointment_requests to service_role;

-- Ensure anonymous browser access remains blocked.
-- Public form submissions must always go through the Netlify Function,
-- never directly from the browser via the anon key.
revoke all on public.appointment_requests from anon;
