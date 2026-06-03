-- =============================================================================
-- P.A.C.E. — Power Automotive Centre of Excellence
-- Migration 004: Digital Inspections + Private Photo Storage
-- =============================================================================
--
-- PURPOSE:
--   Sets up digital vehicle inspections, inspection line items, and private
--   inspection photo storage for the P.A.C.E. staff portal.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard for your project.
--   2. Go to SQL Editor (left sidebar).
--   3. Paste the entire contents of this file and click Run.
--   4. Confirm tables appear in Table Editor before proceeding.
--   IMPORTANT: Migrations 001, 002, and 003 must be run first.
--     - customers, vehicles, activity_logs, set_updated_at() → migration 001
--     - appointment_requests → migration 002
--     - repair_orders → migration 003
--
-- DESIGN NOTES:
--   - Inspections are linked one-to-one with a repair order.
--   - Each inspection has many inspection_items (check line items by category).
--   - Each inspection_item can have many inspection_photos.
--   - Inspection photos are stored in a PRIVATE Supabase Storage bucket.
--     They are never publicly accessible by URL.
--   - Customer photo viewing will be implemented later using short-lived
--     Supabase signed URLs generated server-side through secure approval links.
--   - No delete policies are created. Soft-delete inspection_photos with
--     is_active = false. Do not physically delete inspection records.
--
-- SECURITY:
--   - RLS is enabled on all three inspection tables.
--   - Only authenticated staff can access inspection data directly.
--   - The inspection-photos storage bucket is private (public = false).
--   - Anonymous/public users have no direct access to photos or records.
--   - Never paste a Supabase service role key into frontend code (src/).
--   - Frontend uses only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- SAFE TO RE-RUN:
--   - create table if not exists
--   - create index if not exists
--   - drop trigger if exists before create trigger
--   - drop policy if exists before create policy
--   - storage bucket uses on conflict do nothing
--   - Will not drop or modify existing data
-- =============================================================================


-- =============================================================================
-- TABLE: inspections
-- =============================================================================
-- One inspection per repair order. Tracks the overall inspection workflow
-- and stores notes visible to staff and optionally to the customer.

create table if not exists inspections (
  id                    uuid        primary key default gen_random_uuid(),

  -- One inspection per repair order. Cascade delete keeps data consistent
  -- if an RO is ever removed (should not happen, but defensive).
  repair_order_id       uuid        not null references repair_orders (id) on delete cascade,

  -- Workflow: draft → in_progress → completed → sent_to_customer
  status                text        not null default 'draft',

  -- Staff-only notes about the inspection overall.
  overall_notes         text        null,

  -- Notes the customer can see (shown on customer approval/view page).
  customer_visible_notes text       null,

  -- Timestamps for key workflow events.
  completed_at          timestamptz null,
  sent_to_customer_at   timestamptz null,

  -- Staff member who created this inspection.
  created_by            uuid        null references auth.users (id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint inspection_status_check check (
    status in ('draft', 'in_progress', 'completed', 'sent_to_customer')
  )
);

-- Trigger: auto-update updated_at
drop trigger if exists trg_inspections_updated_at on inspections;
create trigger trg_inspections_updated_at
  before update on inspections
  for each row
  execute function set_updated_at();

-- Indexes
-- Unique: enforces one inspection per repair order (matches the one-to-one design intent).
create unique index if not exists idx_inspections_repair_order_unique
  on inspections (repair_order_id);
create index if not exists idx_inspections_status      on inspections (status);
create index if not exists idx_inspections_created_at  on inspections (created_at);


-- =============================================================================
-- TABLE: inspection_items
-- =============================================================================
-- Individual line items within an inspection. Each item covers one vehicle
-- system or component, rated by condition and optionally with photos.

create table if not exists inspection_items (
  id                   uuid    primary key default gen_random_uuid(),
  inspection_id        uuid    not null references inspections (id) on delete cascade,

  -- Grouping category for display in the portal and customer view.
  -- Common values: tires, brakes, fluids, lights, engine, suspension,
  --                exhaust, hvac, electrical, other
  -- Stored as free text to allow flexibility without schema changes.
  category             text    not null,

  -- Human-readable name for this check point.
  -- e.g. 'Front Brake Pads', 'Engine Air Filter', 'Left Front Tire'
  item_name            text    not null,

  -- Technician's condition rating for this item.
  condition            text    not null default 'not_checked',

  -- Technician's notes about this specific item.
  notes                text    null,

  -- Optional recommended action shown to the customer.
  recommendation       text    null,

  -- Controls display order within a category.
  sort_order           integer not null default 0,

  -- Whether this item is shown on the customer-facing view.
  -- Internal-only items (e.g. shop setup checks) can be hidden.
  is_customer_visible  boolean not null default true,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint inspection_item_condition_check check (
    condition in (
      'not_checked', 'good', 'fair',
      'needs_attention', 'urgent', 'not_applicable'
    )
  )
);

-- Trigger: auto-update updated_at
drop trigger if exists trg_inspection_items_updated_at on inspection_items;
create trigger trg_inspection_items_updated_at
  before update on inspection_items
  for each row
  execute function set_updated_at();

-- Indexes
create index if not exists idx_insp_items_inspection_id on inspection_items (inspection_id);
create index if not exists idx_insp_items_category      on inspection_items (category);
create index if not exists idx_insp_items_condition     on inspection_items (condition);
create index if not exists idx_insp_items_sort_order    on inspection_items (inspection_id, sort_order);


-- =============================================================================
-- TABLE: inspection_photos
-- =============================================================================
-- Photos attached to an inspection, optionally linked to a specific item.
-- Files are stored in the private Supabase Storage bucket 'inspection-photos'.
-- The storage_path column holds the path WITHIN the bucket — not a full URL.
-- Full URLs must never be stored here; always derive via signed URL on request.

create table if not exists inspection_photos (
  id                   uuid    primary key default gen_random_uuid(),
  inspection_id        uuid    not null references inspections (id)      on delete cascade,
  inspection_item_id   uuid    null     references inspection_items (id) on delete set null,

  -- Redundant repair_order_id for efficient server-side queries (e.g. when
  -- generating a customer view link without needing to join through inspections).
  repair_order_id      uuid    not null references repair_orders (id)    on delete cascade,

  -- Storage references — path within the private bucket only, never a full URL.
  storage_bucket       text    not null default 'inspection-photos',
  storage_path         text    not null unique,
  file_name            text    null,
  mime_type            text    null,
  size_bytes           integer null,

  -- Optional caption written by the technician.
  caption              text    null,

  -- Whether this photo is shown on the customer-facing view.
  is_customer_visible  boolean not null default true,

  -- Soft delete. Set to false to hide without physical deletion.
  is_active            boolean not null default true,

  -- Who uploaded this photo.
  uploaded_by          uuid    null references auth.users (id) on delete set null,

  created_at           timestamptz not null default now(),

  -- No updated_at — photos are not edited after upload, only hidden or captioned.
  -- Use a separate UPDATE if caption or visibility changes are needed later.

  constraint inspection_photo_size_check check (
    size_bytes is null or size_bytes >= 0
  )
);

-- Indexes
create index if not exists idx_insp_photos_inspection_id      on inspection_photos (inspection_id);
create index if not exists idx_insp_photos_inspection_item_id on inspection_photos (inspection_item_id);
create index if not exists idx_insp_photos_repair_order_id    on inspection_photos (repair_order_id);
create index if not exists idx_insp_photos_storage_path       on inspection_photos (storage_path);
create index if not exists idx_insp_photos_is_active          on inspection_photos (is_active);


-- =============================================================================
-- SUPABASE STORAGE BUCKET: inspection-photos (private)
-- =============================================================================
-- Creates a private storage bucket for inspection photos.
-- Public = false means no URL-based public access is allowed.
-- All reads must go through Supabase Storage RLS policies or signed URLs.
--
-- Column notes:
--   id                 — bucket identifier used in storage paths and policies
--   name               — display name, matches id by convention
--   public             — false = private; access requires auth or a signed URL
--   file_size_limit    — maximum upload size in bytes (50 MB = 52428800)
--   allowed_mime_types — whitelist upload formats to images only
--
-- NOTE: file_size_limit and allowed_mime_types must exist as columns in
-- storage.buckets for this INSERT to succeed. If they do not exist, SQL will
-- error at the column reference — ON CONFLICT DO NOTHING does not help with
-- missing columns. These columns are present in all current Supabase projects.
--
-- Safe to re-run: the DO block skips the insert if the bucket already exists.

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'inspection-photos'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'inspection-photos',
      'inspection-photos',
      false,
      52428800,                                          -- 50 MB per file
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    );
  end if;
end;
$$;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table inspections      enable row level security;
alter table inspection_items enable row level security;
alter table inspection_photos enable row level security;


-- ---------------------------------------------------------------------------
-- POLICIES: inspections
-- ---------------------------------------------------------------------------
-- MVP: any authenticated staff user can read and write.
-- Future: tighten to role-based access when technician/advisor roles exist.

drop policy if exists "insp: authenticated users can select" on inspections;
create policy "insp: authenticated users can select"
  on inspections for select to authenticated using (true);

drop policy if exists "insp: authenticated users can insert" on inspections;
create policy "insp: authenticated users can insert"
  on inspections for insert to authenticated with check (true);

drop policy if exists "insp: authenticated users can update" on inspections;
create policy "insp: authenticated users can update"
  on inspections for update to authenticated using (true) with check (true);

-- No DELETE policy.


-- ---------------------------------------------------------------------------
-- POLICIES: inspection_items
-- ---------------------------------------------------------------------------

drop policy if exists "insp_items: authenticated users can select" on inspection_items;
create policy "insp_items: authenticated users can select"
  on inspection_items for select to authenticated using (true);

drop policy if exists "insp_items: authenticated users can insert" on inspection_items;
create policy "insp_items: authenticated users can insert"
  on inspection_items for insert to authenticated with check (true);

drop policy if exists "insp_items: authenticated users can update" on inspection_items;
create policy "insp_items: authenticated users can update"
  on inspection_items for update to authenticated using (true) with check (true);

-- No DELETE policy.


-- ---------------------------------------------------------------------------
-- POLICIES: inspection_photos
-- ---------------------------------------------------------------------------

drop policy if exists "insp_photos: authenticated users can select" on inspection_photos;
create policy "insp_photos: authenticated users can select"
  on inspection_photos for select to authenticated using (true);

drop policy if exists "insp_photos: authenticated users can insert" on inspection_photos;
create policy "insp_photos: authenticated users can insert"
  on inspection_photos for insert to authenticated with check (true);

drop policy if exists "insp_photos: authenticated users can update" on inspection_photos;
create policy "insp_photos: authenticated users can update"
  on inspection_photos for update to authenticated using (true) with check (true);

-- No DELETE policy. Use is_active = false for soft-hide.


-- =============================================================================
-- STORAGE OBJECT POLICIES (inspection-photos bucket)
-- =============================================================================
-- Controls who can read and write objects stored in the inspection-photos bucket.
-- Authenticated staff can manage photos. Anonymous access is blocked.
-- Customer photo access will use server-side signed URLs (future phase).

drop policy if exists "insp-photos storage: authenticated select" on storage.objects;
create policy "insp-photos storage: authenticated select"
  on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos');

drop policy if exists "insp-photos storage: authenticated insert" on storage.objects;
create policy "insp-photos storage: authenticated insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos');

drop policy if exists "insp-photos storage: authenticated update" on storage.objects;
create policy "insp-photos storage: authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos')
  with check (bucket_id = 'inspection-photos');

-- No DELETE storage policy.
-- No anon storage policy.
-- Customer access: implemented later via Netlify Function generating signed URLs.


-- =============================================================================
-- EXPLICIT TABLE GRANTS AND REVOKES
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update on table public.inspections      to authenticated;
grant select, insert, update on table public.inspection_items to authenticated;
grant select, insert, update on table public.inspection_photos to authenticated;

revoke all on table public.inspections       from anon;
revoke all on table public.inspection_items  from anon;
revoke all on table public.inspection_photos from anon;


-- =============================================================================
-- END OF MIGRATION 004
-- =============================================================================
-- Tables created or confirmed:
--   inspections      — one per repair order, with status workflow, RLS, trigger, indexes
--   inspection_items — line items per inspection, condition rating, RLS, trigger, indexes
--   inspection_photos — private photo references, RLS, indexes, soft-delete support
--
-- Storage created:
--   inspection-photos bucket — private, 50 MB limit, image types only
--   Storage RLS policies for authenticated staff (select, insert, update)
--
-- Depends on migration 003:
--   repair_orders table (FK reference)
--
-- Depends on migration 001:
--   set_updated_at() function (trigger reuse)
--
-- Next migration: 005_estimates.sql (Phase 8)
--   Will add: estimates, estimate_items, approval_tokens tables
-- =============================================================================
