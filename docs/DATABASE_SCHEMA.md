# P.A.C.E. Database Schema

> Database: Supabase (PostgreSQL)
> All tables use UUID primary keys and include `created_at` / `updated_at` timestamps unless noted.
> `updated_at` should be managed by a Postgres trigger (`moddatetime` extension).

---

## Table Index

1. [staff_users](#1-staff_users)
2. [customers](#2-customers)
3. [vehicles](#3-vehicles)
4. [appointment_requests](#4-appointment_requests)
5. [repair_orders](#5-repair_orders)
6. [inspections](#6-inspections)
7. [inspection_items](#7-inspection_items)
8. [inspection_photos](#8-inspection_photos)
9. [estimates](#9-estimates)
10. [estimate_items](#10-estimate_items)
11. [approval_tokens](#11-approval_tokens)
12. [invoices](#12-invoices)
13. [activity_logs](#13-activity_logs)

---

## 1. staff_users

Links to Supabase `auth.users` table. Extends the built-in auth record with shop-specific profile data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. References `auth.users(id)` |
| `email` | text | Mirrors auth email for convenience |
| `full_name` | text | Display name |
| `role` | text | `'owner'` for MVP. Future: `'technician'`, `'service_advisor'` |
| `is_active` | boolean | Default `true`. Set to `false` to deactivate without deleting |
| `created_at` | timestamptz | Auto |

**Relationships:**
- Referenced by `repair_orders.created_by`
- Referenced by `inspection_photos.uploaded_by`
- Referenced by `activity_logs.staff_user_id`

**Notes:**
- In MVP, only one row exists. Schema is ready for multiple accounts.
- Supabase Auth handles password hashing and session tokens — never store passwords here.

---

## 2. customers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `first_name` | text | Required |
| `last_name` | text | Required |
| `email` | text | Nullable. Used for approval emails |
| `phone` | text | Nullable. Primary contact for calls |
| `preferred_contact` | text | Enum: `'phone'`, `'email'`, `'text'`, `'email_and_text'` |
| `address` | text | Nullable |
| `city` | text | Nullable |
| `province` | text | Default `'AB'` |
| `postal_code` | text | Nullable |
| `notes` | text | Internal staff notes about this customer |
| `is_active` | boolean | Default `true`. Soft delete |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- One customer → many `vehicles`
- One customer → many `appointment_requests`
- One customer → many `repair_orders`
- One customer → many `approval_tokens`

---

## 3. vehicles

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `customer_id` | uuid | FK → `customers(id)`. Required |
| `year` | integer | e.g. `2018` |
| `make` | text | e.g. `'Toyota'` |
| `model` | text | e.g. `'Camry'` |
| `trim` | text | Nullable. e.g. `'XSE V6'` |
| `color` | text | Nullable |
| `vin` | text | Nullable. 17-character VIN |
| `license_plate` | text | Nullable |
| `plate_province` | text | Nullable. e.g. `'AB'` |
| `notes` | text | Nullable. Known issues, customer preferences |
| `is_active` | boolean | Default `true`. Soft delete |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `customer`
- One vehicle → many `repair_orders`

---

## 4. appointment_requests

Captures requests from both the public web form and manually entered phone/walk-in requests. Can be converted to a repair order.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `customer_id` | uuid | FK → `customers(id)`. Nullable (web form submissions may not have a record yet) |
| `vehicle_id` | uuid | FK → `vehicles(id)`. Nullable |
| `source` | text | Enum: `'web_form'`, `'phone'`, `'walk_in'` |
| `name` | text | From web form if no customer_id |
| `email` | text | From web form |
| `phone` | text | From web form |
| `vehicle_info` | text | Free text from web form (Year/Make/Model) |
| `service_requested` | text | Service category or description |
| `preferred_date` | text | Free text from customer ("Thursday morning") |
| `notes` | text | Additional customer notes |
| `status` | text | Enum: `'pending'`, `'confirmed'`, `'cancelled'`, `'converted'` |
| `repair_order_id` | uuid | FK → `repair_orders(id)`. Set when converted to RO |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Optionally linked to `customers` and `vehicles`
- When converted, linked to one `repair_orders` record

---

## 5. repair_orders

The central record of all shop work. Every job flows through a repair order.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `ro_number` | text | Human-readable ID. e.g. `'RO-2024-001'`. Unique. Auto-generated |
| `customer_id` | uuid | FK → `customers(id)`. Required |
| `vehicle_id` | uuid | FK → `vehicles(id)`. Required |
| `appointment_request_id` | uuid | FK → `appointment_requests(id)`. Nullable |
| `status` | text | See status enum below |
| `mileage_in` | integer | Odometer at drop-off |
| `mileage_out` | integer | Nullable. Odometer at pick-up |
| `promised_date` | date | Nullable. When vehicle is promised to be ready |
| `internal_notes` | text | Staff-only notes |
| `customer_concern` | text | What the customer reported |
| `cause` | text | What the tech found |
| `correction` | text | What was done |
| `helcim_invoice_id` | text | Nullable. External Helcim invoice ID |
| `helcim_payment_link` | text | Nullable. Hosted payment URL from Helcim |
| `payment_status` | text | Enum: `'unpaid'`, `'partial'`, `'paid'`. Default `'unpaid'` |
| `created_by` | uuid | FK → `staff_users(id)` |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Status Enum:**
`'draft'` → `'active'` → `'waiting_approval'` → `'approved'` → `'in_progress'` → `'completed'` → `'invoiced'` → `'closed'`
Also: `'cancelled'`

**Relationships:**
- Belongs to one `customer` and one `vehicle`
- Has one `inspection`
- Has many `estimates` (versioned)
- Has one `invoice`
- Has many `activity_logs`

---

## 6. inspections

One inspection per repair order. Contains overall inspection metadata; line items are in `inspection_items`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `repair_order_id` | uuid | FK → `repair_orders(id)`. Unique (one per RO) |
| `status` | text | Enum: `'not_started'`, `'in_progress'`, `'completed'` |
| `technician_notes` | text | Nullable. General notes not tied to a specific item |
| `completed_at` | timestamptz | Nullable. Set when status → completed |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `repair_order`
- Has many `inspection_items`

---

## 7. inspection_items

Individual inspection check items within an inspection. Each can have a condition rating and photos.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `inspection_id` | uuid | FK → `inspections(id)`. Required |
| `category` | text | Enum: `'tires'`, `'brakes'`, `'fluids'`, `'lights'`, `'engine'`, `'suspension'`, `'exhaust'`, `'hvac'`, `'electrical'`, `'other'` |
| `item_name` | text | e.g. `'Front Brake Pads'`, `'Engine Air Filter'` |
| `condition` | text | Enum: `'good'`, `'fair'`, `'needs_attention'`, `'urgent'` |
| `notes` | text | Nullable. Tech observations for this item |
| `sort_order` | integer | Display order within category |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `inspection`
- Has many `inspection_photos`

---

## 8. inspection_photos

Photos attached to individual inspection items. Files are stored in a **private Supabase Storage bucket**, never publicly accessible.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `inspection_item_id` | uuid | FK → `inspection_items(id)`. Required |
| `storage_path` | text | Path within Supabase Storage bucket. e.g. `'inspections/ro-2024-001/photo-uuid.jpg'` |
| `caption` | text | Nullable. Staff caption for this photo |
| `uploaded_by` | uuid | FK → `staff_users(id)` |
| `created_at` | timestamptz | Auto |

**Relationships:**
- Belongs to one `inspection_item`

**Notes:**
- Never store the full public URL — always derive via Supabase signed URL on request
- Access control: staff get permanent authenticated access; customers get short-lived signed URLs via approval token

---

## 9. estimates

Versioned estimates attached to a repair order. Multiple versions allowed (revisions).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `repair_order_id` | uuid | FK → `repair_orders(id)`. Required |
| `version` | integer | Default `1`. Increments on revision |
| `status` | text | Enum: `'draft'`, `'sent'`, `'approved'`, `'declined'`, `'expired'` |
| `subtotal` | numeric(10,2) | Sum of all line items before tax |
| `tax_rate` | numeric(5,4) | e.g. `0.0500` for 5% GST |
| `tax_amount` | numeric(10,2) | Calculated |
| `total` | numeric(10,2) | subtotal + tax |
| `internal_notes` | text | Nullable. Staff notes on this estimate |
| `customer_message` | text | Nullable. Message shown to customer with approval link |
| `sent_at` | timestamptz | Nullable. When approval email was sent |
| `expires_at` | timestamptz | Nullable. Default 7 days after sent |
| `approved_at` | timestamptz | Nullable |
| `declined_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `repair_order`
- Has many `estimate_items`
- Referenced by `approval_tokens`

---

## 10. estimate_items

Individual line items on an estimate (labor, parts, fees).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `estimate_id` | uuid | FK → `estimates(id)`. Required |
| `type` | text | Enum: `'labor'`, `'parts'`, `'sublet'`, `'fee'`, `'discount'` |
| `description` | text | e.g. `'Replace front brake pads - labour'` |
| `quantity` | numeric(8,2) | Hours for labor, units for parts |
| `unit_price` | numeric(10,2) | Per hour or per unit |
| `total` | numeric(10,2) | quantity × unit_price |
| `sort_order` | integer | Display order on estimate |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `estimate`

---

## 11. approval_tokens

Secure one-time tokens sent to customers for estimate approval and inspection viewing.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `token` | uuid | The actual token used in the URL. Unique. Generated with `gen_random_uuid()` |
| `type` | text | Enum: `'estimate_approval'`, `'inspection_view'` |
| `customer_id` | uuid | FK → `customers(id)`. Required |
| `repair_order_id` | uuid | FK → `repair_orders(id)`. Required |
| `estimate_id` | uuid | FK → `estimates(id)`. Nullable (set for estimate_approval type) |
| `expires_at` | timestamptz | Required. Default 7 days from creation |
| `used_at` | timestamptz | Nullable. Set on first meaningful use (approval action) |
| `is_revoked` | boolean | Default `false`. Staff can revoke a token manually |
| `created_at` | timestamptz | Auto |

**Token URL format:**
```
https://powerautomotive.ca/approve/{token}
```

**Access logic (server-side only):**
1. Look up token in database
2. Verify `is_revoked = false`
3. Verify `expires_at > now()`
4. Return the linked estimate or inspection data
5. Never return data beyond what the token type allows

---

## 12. invoices

Records the Helcim invoice associated with a completed repair order. Does not store payment details — those live in Helcim.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `repair_order_id` | uuid | FK → `repair_orders(id)`. Unique (one invoice per RO) |
| `helcim_invoice_id` | text | External Helcim invoice ID. Required |
| `helcim_invoice_number` | text | Human-readable Helcim invoice number |
| `helcim_payment_link` | text | Hosted Helcim payment page URL |
| `amount_due` | numeric(10,2) | Total amount on invoice |
| `amount_paid` | numeric(10,2) | Default `0`. Updated by webhook or manual entry |
| `status` | text | Enum: `'draft'`, `'sent'`, `'partial'`, `'paid'`, `'void'` |
| `sent_at` | timestamptz | Nullable |
| `paid_at` | timestamptz | Nullable. Set by Helcim webhook or manual confirmation |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Relationships:**
- Belongs to one `repair_order`

---

## 13. activity_logs

Append-only audit trail of significant actions in the portal. Never deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `staff_user_id` | uuid | FK → `staff_users(id)`. Nullable for system/webhook actions |
| `action` | text | e.g. `'repair_order.created'`, `'estimate.sent'`, `'approval.received'`, `'invoice.paid'` |
| `entity_type` | text | e.g. `'repair_order'`, `'estimate'`, `'customer'` |
| `entity_id` | uuid | The UUID of the record affected |
| `details` | jsonb | Nullable. Extra context (e.g. old status → new status) |
| `ip_address` | text | Nullable. For staff actions |
| `created_at` | timestamptz | Auto. No `updated_at` — logs are immutable |

**Notes:**
- No RLS update/delete policies on this table — insert only
- Retained indefinitely for accountability

---

## Phase 13 — Schema Additions

### ✅ Implemented: `repair_order_concerns` (Phase 13B)

Replaces the single `repair_order.customer_concern` text field with a structured list. Each row is one customer-reported concern on a repair order.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `repair_order_id` | uuid | FK → `repair_orders(id)` on delete cascade |
| `sort_order` | integer | Display order |
| `concern_text` | text | Customer's reported concern |
| `is_active` | boolean | Default true. Soft delete |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Notes:**
- The existing `repair_order.customer_concern` column coexists for backward compatibility.
- Soft delete only — use `is_active = false` instead of hard delete.

### ✅ Phase 13C — Service History (no schema changes)

Phase 13C (customer/vehicle service history view) reads from existing tables only:
`repair_orders`, `repair_order_concerns`, `inspections`, `estimates`, `helcim_invoices`, `activity_logs`, `customers`, `vehicles`. No migrations required.

---

### Planned: `canned_jobs` (Phase 13D+)

---

### Planned (Phase 13D+): `canned_jobs`

Saved job templates that staff can insert into estimates with one click.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Display name (e.g. "Oil Change Package") |
| `description` | text | Nullable. Longer description or internal notes |
| `item_type` | text | Default type: `'labor'`, `'part'`, etc. |
| `default_price_cents` | integer | Default customer-facing price in cents |
| `is_active` | boolean | Default true. Soft delete |
| `sort_order` | integer | Display order in picker |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

---

### Planned (Phase 13D+): `canned_job_items` (optional, for bundled jobs)

Sub-items within a canned job. Allows a single customer-facing line to have internal cost breakdown (e.g. "Brake Job" = labour + front pads + rotors).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `canned_job_id` | uuid | FK → `canned_jobs(id)` on delete cascade |
| `description` | text | e.g. "Front Brake Pads" |
| `item_type` | text | `'labor'`, `'part'`, etc. |
| `cost_cents` | integer | Nullable. Internal cost |
| `default_price_cents` | integer | Default customer price |
| `sort_order` | integer | Display order |
| `created_at` | timestamptz | Auto |

---

### Planned column additions: `estimate_items`

Three new optional columns for cost tracking and profitability.

| Column | Type | Notes |
|---|---|---|
| `cost_cents` | integer | Nullable. Internal cost price. Never shown to customer. |
| `markup_percent` | numeric(5,2) | Nullable. e.g. `30.00` for 30% markup. |
| `canned_job_id` | uuid | Nullable. FK → `canned_jobs(id)` on delete set null. Tracks which canned job generated this item. |

**Security rule:** `cost_cents` and `markup_percent` must never be returned by `get-approval-estimate.js` or any customer-facing Netlify Function.

---

## Relationship Diagram (Text)

```
staff_users
    └── repair_orders (created_by)
    └── inspection_photos (uploaded_by)
    └── activity_logs (staff_user_id)

customers
    ├── vehicles []
    ├── appointment_requests []
    ├── repair_orders []
    └── approval_tokens []

vehicles
    └── repair_orders []

appointment_requests
    └── repair_orders (optional, when converted)

repair_orders
    ├── inspection (1)
    │     └── inspection_items []
    │               └── inspection_photos []
    ├── estimates [] (versioned)
    │     └── estimate_items []
    ├── approval_tokens []
    └── invoice (1)

activity_logs (references any entity by entity_type + entity_id)
```
