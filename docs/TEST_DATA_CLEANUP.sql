-- =============================================================================
-- P.A.C.E. — Test Data Cleanup
-- FOR MANUAL USE IN SUPABASE DASHBOARD ONLY
-- DO NOT automate. DO NOT run in production without reviewing SELECT previews first.
-- =============================================================================
--
-- PURPOSE:
--   Remove obvious test/development records before owner demo or production hand-off.
--   Target: customers with test-looking names, and all records linked to those customers.
--
-- INSTRUCTIONS:
--   1. Open Supabase Dashboard → SQL Editor.
--   2. Run each SELECT block first to confirm what will be deleted.
--   3. Un-comment the DELETE blocks only after confirming the SELECT results.
--   4. Run deletes in dependency order (deepest tables first).
--   5. The COMMIT at the bottom is commented — un-comment it when ready to finalize.
--
-- WHAT IS SAFE TO DELETE:
--   - Customers whose first_name or last_name is "test" (case-insensitive).
--   - Appointment requests with names/emails/phones that look like test data.
--   - All ROs, estimates, inspections, invoices linked to those test customers.
--
-- WHAT IS NOT DELETED HERE:
--   - Canned job presets (canned_jobs / canned_job_items) — request separately if needed.
--   - Helcim invoice records — do not delete remotely; archive in Helcim dashboard.
--   - Real-looking customer records — only test entries are targeted.
--   - activity_logs — left for audit trail.
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1 — IDENTIFY TEST CUSTOMERS
-- Review this list before proceeding.
-- =============================================================================

SELECT id, first_name, last_name, email, phone, created_at
FROM customers
WHERE lower(first_name) = 'test'
   OR lower(last_name)  = 'test'
   OR lower(email) LIKE '%@test.%'
   OR lower(email) LIKE '%test@%'
ORDER BY created_at DESC;

-- =============================================================================
-- STEP 2 — PREVIEW LINKED VEHICLES
-- =============================================================================

SELECT v.id, v.year, v.make, v.model, v.license_plate,
       c.first_name || ' ' || c.last_name AS customer
FROM vehicles v
JOIN customers c ON c.id = v.customer_id
WHERE lower(c.first_name) = 'test'
   OR lower(c.last_name)  = 'test';

-- =============================================================================
-- STEP 3 — PREVIEW LINKED REPAIR ORDERS
-- =============================================================================

SELECT ro.id, ro.ro_number, ro.status, ro.created_at,
       c.first_name || ' ' || c.last_name AS customer
FROM repair_orders ro
JOIN customers c ON c.id = ro.customer_id
WHERE lower(c.first_name) = 'test'
   OR lower(c.last_name)  = 'test';

-- =============================================================================
-- STEP 4 — PREVIEW LINKED ESTIMATES
-- =============================================================================

SELECT e.id, e.estimate_number, e.status, e.created_at, ro.ro_number
FROM estimates e
JOIN repair_orders ro ON ro.id = e.repair_order_id
JOIN customers c ON c.id = ro.customer_id
WHERE lower(c.first_name) = 'test'
   OR lower(c.last_name)  = 'test';

-- =============================================================================
-- STEP 5 — PREVIEW TEST APPOINTMENT REQUESTS (not linked to customers)
-- =============================================================================

SELECT id, name, email, phone, service_requested, created_at, status
FROM appointment_requests
WHERE lower(name)  LIKE '%test%'
   OR lower(email) LIKE '%@test.%'
   OR lower(email) LIKE '%test@%'
   OR phone        = '0000000000'
   OR phone        = '1234567890'
ORDER BY created_at DESC;

-- =============================================================================
-- DELETE SECTION
-- Un-comment each block after verifying the SELECT results above.
-- Run in this exact order to respect foreign key constraints.
-- =============================================================================

-- ── Delete estimate items (linked to test customer estimates) ──
-- UPDATE estimate_items
-- SET is_active = false
-- WHERE estimate_id IN (
--   SELECT e.id FROM estimates e
--   JOIN repair_orders ro ON ro.id = e.repair_order_id
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Delete estimate jobs (grouped sections on test estimates) ──
-- UPDATE estimate_jobs
-- SET is_active = false
-- WHERE estimate_id IN (
--   SELECT e.id FROM estimates e
--   JOIN repair_orders ro ON ro.id = e.repair_order_id
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Delete approval tokens (linked to test estimates) ──
-- UPDATE approval_tokens
-- SET revoked_at = now()
-- WHERE estimate_id IN (
--   SELECT e.id FROM estimates e
--   JOIN repair_orders ro ON ro.id = e.repair_order_id
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Soft-hide estimates ──
-- UPDATE estimates
-- SET is_active = false
-- WHERE repair_order_id IN (
--   SELECT ro.id FROM repair_orders ro
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Soft-hide inspection items (linked to test ROs) ──
-- UPDATE inspection_items
-- SET is_active = false
-- WHERE inspection_id IN (
--   SELECT i.id FROM inspections i
--   JOIN repair_orders ro ON ro.id = i.repair_order_id
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Soft-hide inspections ──
-- UPDATE inspections
-- SET is_active = false
-- WHERE repair_order_id IN (
--   SELECT ro.id FROM repair_orders ro
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Soft-hide repair order concerns ──
-- UPDATE repair_order_concerns
-- SET is_active = false
-- WHERE repair_order_id IN (
--   SELECT ro.id FROM repair_orders ro
--   JOIN customers c ON c.id = ro.customer_id
--   WHERE lower(c.first_name) = 'test' OR lower(c.last_name) = 'test'
-- );

-- ── Soft-hide repair orders ──
-- UPDATE repair_orders
-- SET is_active = false
-- WHERE customer_id IN (
--   SELECT id FROM customers
--   WHERE lower(first_name) = 'test' OR lower(last_name) = 'test'
-- );

-- ── Soft-hide vehicles linked to test customers ──
-- UPDATE vehicles
-- SET is_active = false
-- WHERE customer_id IN (
--   SELECT id FROM customers
--   WHERE lower(first_name) = 'test' OR lower(last_name) = 'test'
-- );

-- ── Soft-hide test customers ──
-- UPDATE customers
-- SET is_active = false
-- WHERE lower(first_name) = 'test' OR lower(last_name) = 'test';

-- ── Remove test appointment requests (these have no soft-delete, hard-delete only) ──
-- Review the STEP 5 SELECT output carefully before uncommenting.
-- DELETE FROM appointment_requests
-- WHERE lower(name)  LIKE '%test%'
--    OR lower(email) LIKE '%@test.%'
--    OR lower(email) LIKE '%test@%'
--    OR phone        = '0000000000'
--    OR phone        = '1234567890';

-- =============================================================================
-- COMMIT — un-comment only when all deletes above are confirmed correct
-- =============================================================================

-- COMMIT;

ROLLBACK; -- Remove this line and un-comment COMMIT when ready to finalize.

-- =============================================================================
-- END OF TEST DATA CLEANUP
-- =============================================================================
-- Note: helcim_invoices and helcim_invoice_items linked to test ROs are left
-- untouched. Archive them in the Helcim dashboard manually.
-- activity_logs are left for audit trail purposes.
-- =============================================================================
