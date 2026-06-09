-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 013: Appointment Scheduling Fields
-- =============================================================================
--
-- PURPOSE:
--   Adds scheduling, reply, and timestamp fields to appointment_requests so
--   that:
--     - Staff can record a real scheduled date/time (used for calendar display)
--     - Staff can send a reply message to the customer
--     - Status history is tracked (confirmed_at, cancelled_at, replied_at)
--     - The calendar shows only scheduled appointments (scheduled_start NOT NULL)
--       rather than all requests by submission date
--
-- STATUS CHANGE:
--   The existing appt_status_check constraint allowed:
--     'pending' | 'confirmed' | 'cancelled' | 'converted'
--   This migration adds 'processing' (= staff has replied / is handling the request).
--   The constraint is dropped and recreated with the new value.
--
-- NEW COLUMNS:
--   scheduled_start   — ISO timestamptz. Controls calendar placement.
--                       NULL until staff schedules the appointment.
--   scheduled_end     — Optional end time. Display defaults to +1h if blank.
--   scheduled_service — Work to be performed at the scheduled appointment.
--                       Defaults to service_requested when populated by UI.
--   reply_message     — Latest reply message sent by staff to the customer.
--   replied_at        — When the most recent staff reply was sent.
--   confirmed_at      — When status was set to 'confirmed'.
--   cancelled_at      — When status was set to 'cancelled'.
--
-- RLS:
--   Existing authenticated-staff SELECT / INSERT / UPDATE policies cover new
--   columns automatically. No new policies are needed.
--   No DELETE policy is added. Soft status updates replace deletion.
--   Public (anon) role remains revoked — the public booking form still goes
--   through the send-inquiry Netlify Function using the service role key.
--
-- SAFE TO RE-RUN:
--   ADD COLUMN IF NOT EXISTS — no-ops if already present.
--   DROP CONSTRAINT / ADD CONSTRAINT — fully idempotent pattern below.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Update status check constraint to include 'processing'
-- ---------------------------------------------------------------------------

ALTER TABLE appointment_requests
  DROP CONSTRAINT IF EXISTS appt_status_check;

ALTER TABLE appointment_requests
  ADD CONSTRAINT appt_status_check
    CHECK (status IN ('pending', 'processing', 'confirmed', 'cancelled', 'converted'));


-- ---------------------------------------------------------------------------
-- 2. Add scheduling columns
-- ---------------------------------------------------------------------------

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS scheduled_start   timestamptz null,
  ADD COLUMN IF NOT EXISTS scheduled_end     timestamptz null,
  ADD COLUMN IF NOT EXISTS scheduled_service text        null;


-- ---------------------------------------------------------------------------
-- 3. Add reply and timestamp columns
-- ---------------------------------------------------------------------------

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS reply_message  text        null,
  ADD COLUMN IF NOT EXISTS replied_at     timestamptz null,
  ADD COLUMN IF NOT EXISTS confirmed_at   timestamptz null,
  ADD COLUMN IF NOT EXISTS cancelled_at   timestamptz null;


-- ---------------------------------------------------------------------------
-- 4. Index for calendar lookups by scheduled date
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_appt_scheduled_start
  ON appointment_requests (scheduled_start)
  WHERE scheduled_start IS NOT NULL;


-- =============================================================================
-- END OF MIGRATION 013
-- =============================================================================
-- Columns added (idempotent):
--   appointment_requests.scheduled_start
--   appointment_requests.scheduled_end
--   appointment_requests.scheduled_service
--   appointment_requests.reply_message
--   appointment_requests.replied_at
--   appointment_requests.confirmed_at
--   appointment_requests.cancelled_at
--
-- Status constraint updated to include 'processing'.
--
-- Depends on: migrations 001–012 (appointment_requests table must exist).
-- =============================================================================
