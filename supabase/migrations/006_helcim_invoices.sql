-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 006: Helcim Invoice and Payment Tracking
-- =============================================================================
--
-- PURPOSE:
--   Sets up the database tables for tracking Helcim invoices, invoice line
--   item snapshots, and payment events inside the P.A.C.E. staff portal.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm tables appear in Table Editor before proceeding.
--   IMPORTANT: Migrations 001 through 005 must be run first.
--
-- DESIGN NOTES:
--   - This migration stores REFERENCES to Helcim invoices only.
--     Actual payment processing, card data, and transaction history live
--     entirely in Helcim. P.A.C.E. never handles card numbers, CVV, or PANs.
--   - Money is stored as integer cents to avoid floating-point rounding.
--   - helcim_invoice_items are stored as snapshots of what was sent to
--     Helcim. This ensures that later estimate edits do not silently rewrite
--     historical invoice records.
--   - helcim_payment_events are append-only records from future webhooks or
--     manual syncs. They are never physically deleted.
--   - Real Helcim API calls and webhooks are implemented in later sub-phases
--     (Phase 9C: API invoice creation, Phase 9D: webhook payment sync).
--   - No delete policies are created. Use status changes (voided, archived)
--     to close out invoices without physical deletion.
--
-- SECURITY:
--   - RLS is enabled on all three tables.
--   - Only authenticated staff can access invoice data directly.
--   - Future Helcim webhooks will use a Netlify Function with the
--     Supabase service role key — never via direct anon access.
--   - Never expose HELCIM_API_TOKEN or SUPABASE_SERVICE_ROLE_KEY in src/.
--   - Never store card numbers, CVV, expiry, or bank account details here.
--   - If raw_payload on helcim_payment_events ever contains sensitive fields,
--     sanitize them before insert in the webhook Netlify Function.
--
-- SAFE TO RE-RUN:
--   - create table if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
--   - Will not drop or modify existing data
-- =============================================================================


-- =============================================================================
-- TABLE: helcim_invoices
-- =============================================================================
-- One invoice record per Helcim invoice linked to a repair order.
-- The helcim_invoice_id, helcim_invoice_number, and helcim_payment_link
-- are populated after the invoice is created in Helcim (manually or via API).
-- Sync fields (last_synced_at, sync_error) track API sync state for Phase 9C+.

create table if not exists helcim_invoices (
  id                   uuid    primary key default gen_random_uuid(),

  -- Required links
  repair_order_id      uuid    not null references repair_orders (id) on delete cascade,
  estimate_id          uuid    null     references estimates      (id) on delete set null,

  -- Helcim-side identifiers (populated after Helcim invoice is created)
  helcim_invoice_id     text   null,   -- Helcim's internal invoice ID
  helcim_invoice_number text   null,   -- Human-readable Helcim number (e.g. INV-0042)
  helcim_customer_id    text   null,   -- Helcim customer ID if created there
  helcim_payment_link   text   null,   -- Hosted Helcim payment URL shared with customer

  -- Workflow status (P.A.C.E. side)
  status                text   not null default 'draft',

  -- Payment status summary
  payment_status        text   not null default 'unpaid',

  -- Money in cents — division by 100 gives dollars
  subtotal_cents        integer not null default 0,
  tax_cents             integer not null default 0,
  total_cents           integer not null default 0,
  amount_paid_cents     integer not null default 0,
  amount_due_cents      integer not null default 0,

  -- Currency — ISO 4217, 3 characters. Default CAD for Canada.
  currency              text    not null default 'CAD',

  -- Key timestamps
  issued_at             timestamptz null,
  due_at                timestamptz null,
  paid_at               timestamptz null,
  voided_at             timestamptz null,

  -- API sync tracking (Phase 9C+)
  last_synced_at        timestamptz null,
  sync_error            text        null,  -- Last sync error message if any

  notes                 text        null,
  created_by            uuid        null references auth.users (id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Invoice workflow status values
  constraint helcim_inv_status_check check (
    status in ('draft', 'created', 'sent', 'viewed', 'voided', 'cancelled', 'archived')
  ),

  -- Payment status values
  constraint helcim_inv_payment_status_check check (
    payment_status in ('unpaid', 'partial', 'paid', 'refunded', 'failed', 'voided')
  ),

  -- Money must be non-negative
  constraint helcim_inv_subtotal_check   check (subtotal_cents   >= 0),
  constraint helcim_inv_tax_check        check (tax_cents        >= 0),
  constraint helcim_inv_total_check      check (total_cents      >= 0),
  constraint helcim_inv_paid_check       check (amount_paid_cents >= 0),
  constraint helcim_inv_due_check        check (amount_due_cents  >= 0),

  -- Currency must be a 3-character ISO code
  constraint helcim_inv_currency_check   check (length(currency) = 3)
);

-- Trigger: auto-update updated_at
drop trigger if exists trg_helcim_invoices_updated_at on helcim_invoices;
create trigger trg_helcim_invoices_updated_at
  before update on helcim_invoices
  for each row
  execute function set_updated_at();

-- Indexes
create index if not exists idx_helcim_inv_repair_order_id    on helcim_invoices (repair_order_id);
create index if not exists idx_helcim_inv_estimate_id        on helcim_invoices (estimate_id);
create index if not exists idx_helcim_inv_helcim_invoice_id  on helcim_invoices (helcim_invoice_id);
-- Partial unique: prevents linking two portal records to the same Helcim invoice
-- (NULL is allowed — drafts without a Helcim ID yet are not constrained)
create unique index if not exists idx_helcim_inv_helcim_invoice_id_unique
  on helcim_invoices (helcim_invoice_id)
  where helcim_invoice_id is not null;
create index if not exists idx_helcim_inv_invoice_number     on helcim_invoices (helcim_invoice_number);
create index if not exists idx_helcim_inv_status             on helcim_invoices (status);
create index if not exists idx_helcim_inv_payment_status     on helcim_invoices (payment_status);
create index if not exists idx_helcim_inv_created_at         on helcim_invoices (created_at);
create index if not exists idx_helcim_inv_last_synced_at     on helcim_invoices (last_synced_at);


-- =============================================================================
-- TABLE: helcim_invoice_items
-- =============================================================================
-- Snapshot of the line items sent to or linked from Helcim.
-- These are intentional copies — changes to the original estimate_items will
-- NOT retroactively change these records, preserving invoice history.

create table if not exists helcim_invoice_items (
  id                    uuid    primary key default gen_random_uuid(),

  -- Required link to parent invoice
  helcim_invoice_id     uuid    not null references helcim_invoices (id) on delete cascade,

  -- Optional reference back to the source estimate item (for traceability)
  estimate_item_id      uuid    null references estimate_items (id) on delete set null,

  -- Snapshot fields — copied at time of invoice creation, not live-linked
  description           text    not null,
  quantity              numeric(10,2) not null default 1,
  unit_price_cents      integer not null default 0,
  line_total_cents      integer not null default 0,
  item_type             text    null,   -- labor, part, shop_supply, fee, etc. (for reference)
  sort_order            integer not null default 0,

  created_at            timestamptz not null default now(),
  -- No updated_at — invoice item snapshots are immutable after creation

  -- Money must be non-negative
  constraint helcim_inv_item_qty_check   check (quantity          >= 0),
  constraint helcim_inv_item_price_check check (unit_price_cents  >= 0),
  constraint helcim_inv_item_total_check check (line_total_cents  >= 0)
);

-- Indexes
create index if not exists idx_helcim_inv_items_invoice_id      on helcim_invoice_items (helcim_invoice_id);
create index if not exists idx_helcim_inv_items_estimate_item_id on helcim_invoice_items (estimate_item_id);
create index if not exists idx_helcim_inv_items_sort_order       on helcim_invoice_items (helcim_invoice_id, sort_order);


-- =============================================================================
-- TABLE: helcim_payment_events
-- =============================================================================
-- Append-only log of payment events from Helcim webhooks or manual syncs.
-- Each row represents one payment event (paid, partial, refunded, voided, etc.)
-- Records are never physically deleted — use event_type = 'voided' to record voids.
--
-- SECURITY NOTE:
--   raw_payload must never contain card data (card numbers, CVV, expiry dates).
--   Future webhook Netlify Functions MUST sanitize payload before inserting here.

create table if not exists helcim_payment_events (
  id                    uuid    primary key default gen_random_uuid(),

  -- Context links (all nullable since some events may arrive before full linking)
  helcim_invoice_id     uuid    null references helcim_invoices  (id) on delete set null,
  repair_order_id       uuid    null references repair_orders     (id) on delete set null,
  estimate_id           uuid    null references estimates         (id) on delete set null,

  -- Helcim event identifiers
  helcim_event_id       text    null,   -- Helcim's event ID for deduplication
  helcim_transaction_id text    null,   -- Helcim's transaction ID

  -- Event classification
  event_type            text    not null,   -- e.g. 'invoice.paid', 'invoice.partial_payment', 'invoice.voided'
  payment_status        text    null,       -- status reported by Helcim in this event

  -- Amount (may be null for informational events with no amount)
  amount_cents          integer null,
  currency              text    not null default 'CAD',

  -- When Helcim reports the event occurred
  occurred_at           timestamptz null,

  -- Raw webhook or API payload for debugging — never contains card data
  raw_payload           jsonb   null,

  -- Append-only — no updated_at
  created_at            timestamptz not null default now(),

  -- Amount must be non-negative when present
  constraint helcim_evt_amount_check   check (amount_cents is null or amount_cents >= 0),
  constraint helcim_evt_currency_check check (length(currency) = 3)
);

-- Indexes — tuned for webhook deduplication and status lookup
create index if not exists idx_helcim_evt_invoice_id      on helcim_payment_events (helcim_invoice_id);
create index if not exists idx_helcim_evt_repair_order_id on helcim_payment_events (repair_order_id);
create index if not exists idx_helcim_evt_estimate_id     on helcim_payment_events (estimate_id);
create index if not exists idx_helcim_evt_event_id        on helcim_payment_events (helcim_event_id);
-- Partial unique: prevents inserting the same Helcim webhook event twice
-- (NULL is allowed — manually-entered events may have no event ID)
create unique index if not exists idx_helcim_evt_event_id_unique
  on helcim_payment_events (helcim_event_id)
  where helcim_event_id is not null;
create index if not exists idx_helcim_evt_transaction_id  on helcim_payment_events (helcim_transaction_id);
create index if not exists idx_helcim_evt_event_type      on helcim_payment_events (event_type);
create index if not exists idx_helcim_evt_payment_status  on helcim_payment_events (payment_status);
create index if not exists idx_helcim_evt_occurred_at     on helcim_payment_events (occurred_at);
create index if not exists idx_helcim_evt_created_at      on helcim_payment_events (created_at);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table helcim_invoices       enable row level security;
alter table helcim_invoice_items  enable row level security;
alter table helcim_payment_events enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: helcim_invoices
-- ---------------------------------------------------------------------------

drop policy if exists "helcim_inv: authenticated users can select" on helcim_invoices;
create policy "helcim_inv: authenticated users can select"
  on helcim_invoices for select to authenticated using (true);

drop policy if exists "helcim_inv: authenticated users can insert" on helcim_invoices;
create policy "helcim_inv: authenticated users can insert"
  on helcim_invoices for insert to authenticated with check (true);

drop policy if exists "helcim_inv: authenticated users can update" on helcim_invoices;
create policy "helcim_inv: authenticated users can update"
  on helcim_invoices for update to authenticated using (true) with check (true);

-- No DELETE policy.


-- ---------------------------------------------------------------------------
-- POLICIES: helcim_invoice_items
-- ---------------------------------------------------------------------------

drop policy if exists "helcim_inv_items: authenticated users can select" on helcim_invoice_items;
create policy "helcim_inv_items: authenticated users can select"
  on helcim_invoice_items for select to authenticated using (true);

drop policy if exists "helcim_inv_items: authenticated users can insert" on helcim_invoice_items;
create policy "helcim_inv_items: authenticated users can insert"
  on helcim_invoice_items for insert to authenticated with check (true);

drop policy if exists "helcim_inv_items: authenticated users can update" on helcim_invoice_items;
create policy "helcim_inv_items: authenticated users can update"
  on helcim_invoice_items for update to authenticated using (true) with check (true);

-- No DELETE policy. Invoice item snapshots are immutable in intent.


-- ---------------------------------------------------------------------------
-- POLICIES: helcim_payment_events
-- ---------------------------------------------------------------------------

drop policy if exists "helcim_evt: authenticated users can select" on helcim_payment_events;
create policy "helcim_evt: authenticated users can select"
  on helcim_payment_events for select to authenticated using (true);

drop policy if exists "helcim_evt: authenticated users can insert" on helcim_payment_events;
create policy "helcim_evt: authenticated users can insert"
  on helcim_payment_events for insert to authenticated with check (true);

drop policy if exists "helcim_evt: authenticated users can update" on helcim_payment_events;
create policy "helcim_evt: authenticated users can update"
  on helcim_payment_events for update to authenticated using (true) with check (true);

-- No DELETE policy. Payment events are an append-only audit trail.


-- =============================================================================
-- EXPLICIT GRANTS AND REVOKES
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update on table public.helcim_invoices       to authenticated;
grant select, insert, update on table public.helcim_invoice_items  to authenticated;
grant select, insert, update on table public.helcim_payment_events to authenticated;

revoke all on table public.helcim_invoices       from anon;
revoke all on table public.helcim_invoice_items  from anon;
revoke all on table public.helcim_payment_events from anon;


-- =============================================================================
-- END OF MIGRATION 006
-- =============================================================================
-- Tables created:
--   helcim_invoices       — invoice tracking with Helcim reference fields
--   helcim_invoice_items  — immutable snapshot of invoice line items
--   helcim_payment_events — append-only payment event log for webhooks/syncs
--
-- Depends on migration 003:  repair_orders table (FK reference)
-- Depends on migration 005:  estimates, estimate_items tables (FK references)
-- Depends on migration 001:  set_updated_at() function (trigger on helcim_invoices)
--
-- Next steps:
--   Phase 9B: Staff invoice linking UI (portal Invoices page, manual entry)
--   Phase 9C: Helcim API invoice creation via Netlify Function
--   Phase 9D: Helcim webhook handler for automatic payment status sync
--   Run 006b_helcim_service_role_grants.sql when Netlify Functions need access
-- =============================================================================
