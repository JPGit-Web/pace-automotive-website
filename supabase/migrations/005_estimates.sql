-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 005: Estimates, Estimate Items, and Approval Tokens
-- =============================================================================
--
-- PURPOSE:
--   Sets up estimates and line items that staff build for customer approval,
--   plus the approval_tokens table that will eventually power secure
--   customer-facing approval links.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm tables appear in Table Editor before proceeding.
--   IMPORTANT: Migrations 001 through 004 must be run first.
--
-- DESIGN NOTES:
--   - Money is stored in integer cents (subtotal_cents, etc.) to avoid
--     floating-point rounding issues. Divide by 100 to display as dollars.
--   - Estimate numbers are human-readable: EST-YYYY-0001.
--   - Line items support per-item customer approval (approved/declined).
--   - approval_tokens stores only a token_hash, never the raw token.
--     The raw token lives only in the customer's email URL and is hashed
--     before being stored. Lookup is done by hashing the URL token and
--     comparing to token_hash.
--   - Customer approval access will be handled through Netlify Functions,
--     not direct anon table access. No public RLS policies are created here.
--   - No delete policies are created. Use status changes and is_active flags.
--
-- SECURITY:
--   - RLS is enabled on all three tables.
--   - Only authenticated staff can access this data directly.
--   - approval_tokens: no anon policy. Customer access is server-side only.
--   - Never paste a Supabase service role key into frontend code (src/).
--   - Frontend uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- SAFE TO RE-RUN:
--   - create sequence if not exists
--   - create table if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
--   - Will not drop or modify existing data
-- =============================================================================


-- =============================================================================
-- SEQUENCE: estimate number counter
-- =============================================================================
-- Same pattern as repair_order_number_seq from migration 003.

create sequence if not exists estimate_number_seq
  start 1
  increment 1
  minvalue 1
  no maxvalue
  cache 1;


-- =============================================================================
-- TABLE: estimates
-- =============================================================================
-- One or more estimates can be attached to a repair order (e.g. initial
-- estimate, then a revised estimate after further diagnosis).
-- Money is stored as integer cents to avoid floating-point errors.

create table if not exists estimates (
  id               uuid    primary key default gen_random_uuid(),

  repair_order_id  uuid    not null references repair_orders (id) on delete cascade,

  -- Human-readable estimate number: EST-YYYY-0001
  estimate_number  text    not null unique
                   default (
                     'EST-'
                     || to_char(now(), 'YYYY')
                     || '-'
                     || lpad(nextval('estimate_number_seq')::text, 4, '0')
                   ),

  -- Workflow status
  status           text    not null default 'draft',

  -- Optional display title shown on customer-facing estimate
  title            text    null,

  -- Message to the customer shown alongside the approval link
  customer_message text    null,

  -- Money in cents. Divide by 100 to display as dollars.
  -- Tax is calculated and stored separately for clarity.
  subtotal_cents      integer not null default 0,
  tax_cents           integer not null default 0,
  total_cents         integer not null default 0,
  approved_total_cents integer not null default 0,

  -- Workflow timestamps
  sent_at          timestamptz null,
  approved_at      timestamptz null,
  declined_at      timestamptz null,
  expires_at       timestamptz null,

  created_by       uuid    null references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint estimate_status_check check (
    status in (
      'draft', 'sent', 'partially_approved', 'approved',
      'declined', 'expired', 'cancelled'
    )
  ),

  -- Money must be non-negative
  constraint estimate_subtotal_check      check (subtotal_cents      >= 0),
  constraint estimate_tax_check           check (tax_cents           >= 0),
  constraint estimate_total_check         check (total_cents         >= 0),
  constraint estimate_approved_total_check check (approved_total_cents >= 0)
);

drop trigger if exists trg_estimates_updated_at on estimates;
create trigger trg_estimates_updated_at
  before update on estimates
  for each row
  execute function set_updated_at();

create index if not exists idx_estimates_repair_order_id on estimates (repair_order_id);
create index if not exists idx_estimates_estimate_number on estimates (estimate_number);
create index if not exists idx_estimates_status          on estimates (status);
create index if not exists idx_estimates_created_at      on estimates (created_at);
create index if not exists idx_estimates_expires_at      on estimates (expires_at);


-- =============================================================================
-- TABLE: estimate_items
-- =============================================================================
-- Individual line items on an estimate.
-- Each item can be customer-approved or declined independently.
-- Items can be linked back to an inspection item for traceability.
-- Soft-delete with is_active = false instead of physical deletion.

create table if not exists estimate_items (
  id                   uuid    primary key default gen_random_uuid(),
  estimate_id          uuid    not null references estimates (id)        on delete cascade,
  repair_order_id      uuid    not null references repair_orders (id)    on delete cascade,

  -- Optional link to the inspection item that triggered this estimate line
  inspection_item_id   uuid    null references inspection_items (id)     on delete set null,

  -- Line item classification
  item_type            text    not null default 'labor',
  description          text    not null,

  -- Quantity (hours for labor, units for parts)
  quantity             numeric(10,2) not null default 1,

  -- Money in cents
  unit_price_cents     integer not null default 0,
  line_total_cents     integer not null default 0,

  -- Per-item customer approval (supports partial approvals)
  approval_status      text    not null default 'pending',

  -- Required items cannot be individually declined (e.g. diagnosis fee)
  is_required          boolean not null default false,

  -- Whether this line appears on the customer-facing estimate
  is_customer_visible  boolean not null default true,

  -- Soft delete — hide without physical removal
  is_active            boolean not null default true,

  sort_order           integer not null default 0,
  notes                text    null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint estimate_item_type_check check (
    item_type in ('labor', 'part', 'shop_supply', 'fee', 'discount', 'other')
  ),

  constraint estimate_item_approval_check check (
    approval_status in ('pending', 'approved', 'declined')
  ),

  constraint estimate_item_qty_check        check (quantity          >= 0),
  constraint estimate_item_unit_price_check check (unit_price_cents  >= 0),
  constraint estimate_item_total_check      check (line_total_cents  >= 0)
);

drop trigger if exists trg_estimate_items_updated_at on estimate_items;
create trigger trg_estimate_items_updated_at
  before update on estimate_items
  for each row
  execute function set_updated_at();

create index if not exists idx_est_items_estimate_id        on estimate_items (estimate_id);
create index if not exists idx_est_items_repair_order_id    on estimate_items (repair_order_id);
create index if not exists idx_est_items_inspection_item_id on estimate_items (inspection_item_id);
create index if not exists idx_est_items_approval_status    on estimate_items (approval_status);
create index if not exists idx_est_items_is_active          on estimate_items (is_active);
create index if not exists idx_est_items_sort_order         on estimate_items (estimate_id, sort_order);


-- =============================================================================
-- TABLE: approval_tokens
-- =============================================================================
-- Secure tokens that allow customers to view and approve estimates without
-- logging into the portal. Only the hash of the raw token is stored here.
--
-- Token flow (implemented in a later phase):
--   1. Staff clicks "Send for Approval" in the portal.
--   2. Server generates a random UUID token.
--   3. Server hashes it with SHA-256 and stores token_hash here.
--   4. Server sends the raw token to the customer by email:
--      https://powerautomotive.ca/approve/{raw-token}
--   5. Customer visits the URL. The raw token is hashed and looked up
--      against token_hash to validate the request.
--   6. The raw token is never stored in the database.
--
-- Security properties:
--   - token_hash is not reversible. Compromising the database does not
--     expose valid raw tokens.
--   - expires_at limits the token's validity window.
--   - revoked_at allows staff to invalidate a token immediately.
--   - used_at is set when the customer takes an approval action.

create table if not exists approval_tokens (
  id               uuid    primary key default gen_random_uuid(),
  estimate_id      uuid    not null references estimates (id)     on delete cascade,
  repair_order_id  uuid    not null references repair_orders (id) on delete cascade,

  -- SHA-256 hash of the raw token. Never the raw token itself.
  token_hash       text    not null unique,

  -- Optional label for staff reference (e.g. "Sent to customer phone")
  token_label      text    null,

  -- Contact info captured at send time for reference
  customer_email   text    null,
  customer_phone   text    null,

  -- Lifecycle timestamps
  expires_at       timestamptz not null,
  used_at          timestamptz null,
  revoked_at       timestamptz null,

  created_at       timestamptz not null default now()

  -- No updated_at — token metadata does not change after creation.
  -- Only used_at and revoked_at are set post-creation, which are append-only.
);

create index if not exists idx_approval_tokens_estimate_id     on approval_tokens (estimate_id);
create index if not exists idx_approval_tokens_repair_order_id on approval_tokens (repair_order_id);
create index if not exists idx_approval_tokens_token_hash      on approval_tokens (token_hash);
create index if not exists idx_approval_tokens_expires_at      on approval_tokens (expires_at);
create index if not exists idx_approval_tokens_used_at         on approval_tokens (used_at);
create index if not exists idx_approval_tokens_revoked_at      on approval_tokens (revoked_at);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table estimates       enable row level security;
alter table estimate_items  enable row level security;
alter table approval_tokens enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: estimates
-- ---------------------------------------------------------------------------

drop policy if exists "est: authenticated users can select" on estimates;
create policy "est: authenticated users can select"
  on estimates for select to authenticated using (true);

drop policy if exists "est: authenticated users can insert" on estimates;
create policy "est: authenticated users can insert"
  on estimates for insert to authenticated with check (true);

drop policy if exists "est: authenticated users can update" on estimates;
create policy "est: authenticated users can update"
  on estimates for update to authenticated using (true) with check (true);

-- No DELETE policy.


-- ---------------------------------------------------------------------------
-- POLICIES: estimate_items
-- ---------------------------------------------------------------------------

drop policy if exists "est_items: authenticated users can select" on estimate_items;
create policy "est_items: authenticated users can select"
  on estimate_items for select to authenticated using (true);

drop policy if exists "est_items: authenticated users can insert" on estimate_items;
create policy "est_items: authenticated users can insert"
  on estimate_items for insert to authenticated with check (true);

drop policy if exists "est_items: authenticated users can update" on estimate_items;
create policy "est_items: authenticated users can update"
  on estimate_items for update to authenticated using (true) with check (true);

-- No DELETE policy. Use is_active = false for soft delete.


-- ---------------------------------------------------------------------------
-- POLICIES: approval_tokens
-- ---------------------------------------------------------------------------
-- Authenticated staff can manage tokens (create, view, revoke).
-- Customer access is NOT handled here — it will be implemented via a
-- Netlify Function using the service role key, which bypasses RLS entirely.
-- No anon policy is created.

drop policy if exists "approval_tokens: authenticated users can select" on approval_tokens;
create policy "approval_tokens: authenticated users can select"
  on approval_tokens for select to authenticated using (true);

drop policy if exists "approval_tokens: authenticated users can insert" on approval_tokens;
create policy "approval_tokens: authenticated users can insert"
  on approval_tokens for insert to authenticated with check (true);

drop policy if exists "approval_tokens: authenticated users can update" on approval_tokens;
create policy "approval_tokens: authenticated users can update"
  on approval_tokens for update to authenticated using (true) with check (true);

-- No DELETE policy.
-- No anon policy — customer access is server-side only via Netlify Function.


-- =============================================================================
-- EXPLICIT GRANTS AND REVOKES
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update on table public.estimates       to authenticated;
grant select, insert, update on table public.estimate_items  to authenticated;
grant select, insert, update on table public.approval_tokens to authenticated;

-- Sequence grant: authenticated staff need to advance the sequence when
-- inserting estimates, because estimate_number uses nextval().
grant usage, select on sequence public.estimate_number_seq to authenticated;

revoke all on table public.estimates       from anon;
revoke all on table public.estimate_items  from anon;
revoke all on table public.approval_tokens from anon;


-- =============================================================================
-- END OF MIGRATION 005
-- =============================================================================
-- Created:
--   estimate_number_seq — counter for EST-YYYY-0001 human-readable numbers
--   estimates           — estimate records with money in cents, RLS, trigger, indexes
--   estimate_items      — line items with per-item approval, RLS, trigger, indexes
--   approval_tokens     — hash-only token storage, no anon access, RLS, indexes
--
-- Depends on migration 003:
--   repair_orders table (FK reference)
--
-- Depends on migration 004:
--   inspection_items table (FK reference from estimate_items.inspection_item_id)
--
-- Depends on migration 001:
--   set_updated_at() function (trigger reuse)
--
-- Next migration: 006_invoices.sql (Phase 9)
--   Will add: invoices table for Helcim payment linking
-- =============================================================================
