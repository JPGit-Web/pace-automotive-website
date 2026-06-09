/**
 * P.A.C.E. Portal — Supabase data helpers
 *
 * All functions use the authenticated Supabase client (anon key + RLS).
 * No service role key is used here — this file is frontend-safe.
 *
 * Soft deletes: never call .delete(). Set is_active = false instead.
 */

import { supabase } from "./supabase";

// ─────────────────────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────────────────────

/** Fetch all active customers, ordered by last name. */
export async function listCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return data;
}

/** Fetch a single customer by ID. */
export async function getCustomer(customerId) {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) throw error;
  return data;
}

/** Create a new customer record. Returns the created row. */
export async function createCustomer(customerData) {
  // Normalize empty strings to null for optional fields before insert
  const CUSTOMER_COLUMNS = [
    "first_name", "last_name", "email", "phone", "preferred_contact",
    "address", "city", "province", "postal_code", "notes",
  ];
  const fields = {};
  for (const col of CUSTOMER_COLUMNS) {
    const val = customerData[col];
    fields[col] = (typeof val === "string" && val.trim() === "") ? null : (val ?? null);
  }
  if (fields.first_name) fields.first_name = fields.first_name.trim();
  if (fields.last_name)  fields.last_name  = fields.last_name.trim();

  const { data, error } = await supabase
    .from("customers")
    .insert([fields])
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createCustomer] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Update an existing customer record. Returns the updated row. */
export async function updateCustomer(customerId, customerData) {
  // Explicit allowlist — only send columns that exist on the customers table.
  // This prevents accidental injection of extra fields (joined relations, UI
  // state, vehicle-only fields like "year") that would cause Supabase to reject
  // the update with a "column does not exist" error.
  const CUSTOMER_COLUMNS = [
    "first_name", "last_name", "email", "phone", "preferred_contact",
    "address", "city", "province", "postal_code", "notes",
  ];

  const fields = {};
  for (const col of CUSTOMER_COLUMNS) {
    // Normalize empty strings to null for optional fields so the database
    // stores a clean null rather than an empty string.
    const val = customerData[col];
    fields[col] = (typeof val === "string" && val.trim() === "") ? null : (val ?? null);
  }
  // Always preserve first_name and last_name as trimmed strings (required fields)
  if (fields.first_name) fields.first_name = fields.first_name.trim();
  if (fields.last_name)  fields.last_name  = fields.last_name.trim();

  const { data, error } = await supabase
    .from("customers")
    .update(fields)
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateCustomer] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Soft-delete a customer by setting is_active = false. */
export async function softDeleteCustomer(customerId) {
  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all active vehicles with basic customer info joined.
 * Supabase auto-join syntax: customers(id, first_name, last_name)
 */
export async function listVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, customers(id, first_name, last_name)")
    .eq("is_active", true)
    .order("make", { ascending: true })
    .order("model", { ascending: true });

  if (error) throw error;
  return data;
}

/** Fetch active vehicles belonging to one customer. */
export async function listVehiclesByCustomer(customerId) {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("make", { ascending: true });

  if (error) throw error;
  return data;
}

/** Create a new vehicle record. Returns the created row. */
export async function createVehicle(vehicleData) {
  const { data, error } = await supabase
    .from("vehicles")
    .insert([vehicleData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update an existing vehicle record. Returns the updated row. */
export async function updateVehicle(vehicleId, vehicleData) {
  const { id, created_at, updated_at, customers, ...fields } = vehicleData;

  const { data, error } = await supabase
    .from("vehicles")
    .update(fields)
    .eq("id", vehicleId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Soft-delete a vehicle by setting is_active = false. */
export async function softDeleteVehicle(vehicleId) {
  const { data, error } = await supabase
    .from("vehicles")
    .update({ is_active: false })
    .eq("id", vehicleId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// REPAIR ORDER CONCERNS (Phase 13B)
// ─────────────────────────────────────────────────────────────

/** Fetch active concerns for a repair order, ordered by sort_order. */
export async function listRepairOrderConcerns(repairOrderId) {
  const { data, error } = await supabase
    .from("repair_order_concerns")
    .select("id, concern_text, sort_order, created_at")
    .eq("repair_order_id", repairOrderId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Insert a single concern row. */
export async function createRepairOrderConcern(repairOrderId, { concern_text, sort_order = 0 }) {
  const { data, error } = await supabase
    .from("repair_order_concerns")
    .insert([{ repair_order_id: repairOrderId, concern_text, sort_order }])
    .select()
    .single();
  if (error) {
    if (import.meta.env.DEV) console.error("[createRepairOrderConcern]", error);
    throw error;
  }
  return data;
}

/** Bulk-insert multiple concern rows for a new RO. */
export async function bulkCreateRepairOrderConcerns(repairOrderId, texts = []) {
  const rows = texts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((concern_text, i) => ({ repair_order_id: repairOrderId, concern_text, sort_order: i }));
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("repair_order_concerns").insert(rows).select();
  if (error) {
    if (import.meta.env.DEV) console.error("[bulkCreateRepairOrderConcerns]", error);
    throw error;
  }
  return data ?? [];
}

/** Update the text of an existing concern. */
export async function updateRepairOrderConcern(id, { concern_text }) {
  const { data, error } = await supabase
    .from("repair_order_concerns")
    .update({ concern_text })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-hide a concern (is_active = false). */
export async function softHideRepairOrderConcern(id) {
  const { data, error } = await supabase
    .from("repair_order_concerns")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// REPAIR ORDERS
// ─────────────────────────────────────────────────────────────

const RO_COLUMNS = [
  "customer_id", "vehicle_id", "appointment_request_id",
  "status", "mileage_in", "mileage_out", "promised_date",
  "customer_concern", "cause", "correction", "internal_notes",
  "payment_status", "helcim_invoice_id", "helcim_payment_link",
];

/** Fetch all repair orders with customer + vehicle names joined, newest first. */
export async function listRepairOrders() {
  const { data, error } = await supabase
    .from("repair_orders")
    .select(`
      id, ro_number, status, payment_status, promised_date, created_at,
      customers (id, first_name, last_name),
      vehicles  (id, year, make, model, license_plate)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Fetch a single repair order with related customer, vehicle, and optional
 * appointment request for the detail panel.
 *
 * Uses separate queries instead of a nested Supabase join because there are
 * two FK relationships between repair_orders and appointment_requests
 * (repair_orders.appointment_request_id and appointment_requests.repair_order_id),
 * which causes PostgREST to throw an ambiguous-relationship error when both
 * tables are joined in a single .select() call.
 */
export async function getRepairOrder(id) {
  // 1. Fetch the repair order row
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (roErr) throw roErr;

  // 2. Fetch customer
  let customer = null;
  if (ro.customer_id) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .eq("id", ro.customer_id)
      .single();
    if (!error) customer = data;
    else if (import.meta.env.DEV) console.warn("[getRepairOrder] customer fetch:", error);
  }

  // 3. Fetch vehicle
  let vehicle = null;
  if (ro.vehicle_id) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, year, make, model, trim, license_plate, plate_province, color, vin")
      .eq("id", ro.vehicle_id)
      .single();
    if (!error) vehicle = data;
    else if (import.meta.env.DEV) console.warn("[getRepairOrder] vehicle fetch:", error);
  }

  // 4. Fetch appointment request if linked
  let appointmentRequest = null;
  if (ro.appointment_request_id) {
    const { data, error } = await supabase
      .from("appointment_requests")
      .select("id, name, phone, service_requested, notes, preferred_date, source, status")
      .eq("id", ro.appointment_request_id)
      .single();
    if (!error) appointmentRequest = data;
    else if (import.meta.env.DEV) console.warn("[getRepairOrder] appointment_request fetch:", error);
  }

  return {
    ...ro,
    customers:            customer,
    vehicles:             vehicle,
    appointment_requests: appointmentRequest,
  };
}

/** Create a new repair order. Returns the created row with basic joins. */
export async function createRepairOrder(roData) {
  const fields = {};
  for (const col of RO_COLUMNS) {
    const val = roData[col];
    // Empty strings → null for nullable fields.
    // undefined/null → omit from payload so the database DEFAULT takes over.
    if (val === undefined || val === null) {
      // Do not include — Postgres will apply the column DEFAULT.
      continue;
    }
    if (typeof val === "string" && val.trim() === "") {
      // Empty string: only omit (use DB default) for the NOT NULL status fields;
      // for other fields, store null to clear a previously-entered value.
      if (col === "status" || col === "payment_status") continue;
      fields[col] = null;
    } else {
      fields[col] = val;
    }
  }

  // Always ensure NOT NULL fields have valid values even if caller omitted them
  if (!fields.status)         fields.status         = "draft";
  if (!fields.payment_status) fields.payment_status = "unpaid";

  // Set created_by from current session
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) fields.created_by = session.user.id;
  } catch { /* non-fatal */ }

  // Select only scalar columns after insert to avoid PostgREST join ambiguity.
  // Additional FK relationships added in later migrations (e.g. helcim_invoices)
  // can make nested joins in a post-insert .select() fail with a 400.
  // The caller (handleCreate in PortalRepairOrders.jsx) fetches the full
  // detail separately via getRepairOrder(), so nested joins are not needed here.
  const { data, error } = await supabase
    .from("repair_orders")
    .insert([fields])
    .select("id, ro_number, status, payment_status, promised_date, created_at, customer_id, vehicle_id")
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createRepairOrder] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Update editable fields on a repair order. */
export async function updateRepairOrder(id, roData) {
  const EDITABLE = [
    "status", "mileage_in", "mileage_out", "promised_date",
    "customer_concern", "cause", "correction", "internal_notes",
    "payment_status", "helcim_invoice_id", "helcim_payment_link",
  ];
  const fields = {};
  for (const col of EDITABLE) {
    const val = roData[col];
    fields[col] = (typeof val === "string" && val.trim() === "") ? null : (val ?? null);
  }

  const { data, error } = await supabase
    .from("repair_orders")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateRepairOrder] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Update only the status field on a repair order. */
export async function updateRepairOrderStatus(id, status) {
  const { data, error } = await supabase
    .from("repair_orders")
    .update({ status })
    .eq("id", id)
    .select("id, ro_number, status, payment_status, promised_date, created_at, customers(id, first_name, last_name), vehicles(id, year, make, model, license_plate)")
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateRepairOrderStatus] Supabase error:", error);
    throw error;
  }
  return data;
}

/**
 * Convert an appointment request into a repair order.
 * Creates the repair order, then marks the appointment as converted.
 * If the appointment update fails after RO creation, the RO is kept
 * and the error is logged — we do not rollback.
 */
export async function convertAppointmentToRepairOrder(appointmentRequestId, {
  customerId, vehicleId, mileageIn, promisedDate, customerConcern, internalNotes,
}) {
  // 1. Create the repair order
  const ro = await createRepairOrder({
    customer_id:            customerId,
    vehicle_id:             vehicleId,
    appointment_request_id: appointmentRequestId,
    customer_concern:       customerConcern || null,
    mileage_in:             mileageIn       || null,
    promised_date:          promisedDate    || null,
    internal_notes:         internalNotes   || null,
    status:                 "draft",
    payment_status:         "unpaid",
  });

  // 2. Mark appointment as converted
  try {
    const { error: apptError } = await supabase
      .from("appointment_requests")
      .update({ status: "converted", repair_order_id: ro.id })
      .eq("id", appointmentRequestId);

    if (apptError) {
      console.error("[convertAppointmentToRepairOrder] Appointment update failed:", apptError);
      // RO was created — do not rollback. Staff can manually link if needed.
    }
  } catch (apptErr) {
    console.error("[convertAppointmentToRepairOrder] Appointment update threw:", apptErr.message);
  }

  return ro;
}

// ─────────────────────────────────────────────────────────────
// HELCIM INVOICES
// ─────────────────────────────────────────────────────────────

const HELCIM_INV_EDITABLE = [
  "helcim_invoice_id", "helcim_invoice_number", "helcim_customer_id",
  "helcim_payment_link", "status", "payment_status",
  "subtotal_cents", "tax_cents", "total_cents",
  "amount_paid_cents", "amount_due_cents",
  "issued_at", "due_at", "paid_at", "voided_at", "notes",
];

/** List all Helcim invoices with RO / customer / vehicle joined. */
export async function listHelcimInvoices() {
  const { data, error } = await supabase
    .from("helcim_invoices")
    .select(`
      id, helcim_invoice_id, helcim_invoice_number, helcim_payment_link,
      status, payment_status,
      subtotal_cents, tax_cents, total_cents, amount_paid_cents, amount_due_cents,
      issued_at, due_at, paid_at, created_at, repair_order_id, estimate_id,
      repair_orders (
        id, ro_number,
        customers (first_name, last_name),
        vehicles   (year, make, model)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Full invoice detail — separate queries to avoid PostgREST join ambiguity.
 */
export async function getHelcimInvoice(invoiceId) {
  const { data: inv, error } = await supabase
    .from("helcim_invoices").select("*").eq("id", invoiceId).single();
  if (error) throw error;

  const { data: items } = await supabase
    .from("helcim_invoice_items").select("*")
    .eq("helcim_invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  let ro = null, customer = null, vehicle = null, estimate = null, concerns = [];
  if (inv.repair_order_id) {
    const { data: roData } = await supabase
      .from("repair_orders")
      .select("id, ro_number, customer_id, vehicle_id, mileage_in, mileage_out, customer_concern")
      .eq("id", inv.repair_order_id).single();
    ro = roData;
    if (ro?.customer_id) {
      const { data } = await supabase.from("customers")
        .select("id, first_name, last_name, email, phone").eq("id", ro.customer_id).single();
      customer = data;
    }
    if (ro?.vehicle_id) {
      const { data } = await supabase.from("vehicles")
        .select("id, year, make, model, trim, color, vin, license_plate, plate_province")
        .eq("id", ro.vehicle_id).single();
      vehicle = data;
    }
    const { data: concernData } = await supabase
      .from("repair_order_concerns")
      .select("id, concern_text, sort_order")
      .eq("repair_order_id", inv.repair_order_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    concerns = concernData ?? [];
  }
  if (inv.estimate_id) {
    const { data } = await supabase.from("estimates")
      .select("id, estimate_number, status, total_cents, approved_total_cents")
      .eq("id", inv.estimate_id).single();
    estimate = data;
  }

  // Fallback: if no helcim_invoice_items exist, pull customer-facing estimate items for printing.
  // Only safe columns selected — cost_cents and markup_percent are intentionally excluded.
  let printItems = items?.length ? items : [];
  if (!printItems.length && inv.estimate_id) {
    const { data: estItems } = await supabase
      .from("estimate_items")
      .select("id, description, quantity, unit_price_cents, line_total_cents, item_type, sort_order")
      .eq("estimate_id", inv.estimate_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    printItems = estItems ?? [];
  }

  return { ...inv, items: items || [], printItems, ro, customer, vehicle, estimate, concerns };
}

/** Get the most recent invoice for a repair order (null if none). */
export async function getHelcimInvoiceByRepairOrder(repairOrderId) {
  const { data, error } = await supabase
    .from("helcim_invoices")
    .select("id, helcim_invoice_number, status, payment_status")
    .eq("repair_order_id", repairOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** Get the invoice linked to a specific estimate (null if none). */
export async function getHelcimInvoiceByEstimate(estimateId) {
  const { data, error } = await supabase
    .from("helcim_invoices")
    .select("id, helcim_invoice_number, status, payment_status")
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** Create a manual invoice tracking record (no Helcim API called). */
export async function createManualHelcimInvoice(data) {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const payload = { created_by: session?.user?.id ?? null };
  for (const k of HELCIM_INV_EDITABLE) if (k in data) payload[k] = data[k] ?? null;
  if (!payload.repair_order_id && data.repair_order_id)
    payload.repair_order_id = data.repair_order_id;

  const { data: inv, error } = await supabase
    .from("helcim_invoices").insert([payload]).select().single();
  if (error) {
    if (import.meta.env.DEV) console.error("[createManualHelcimInvoice]", error);
    throw error;
  }
  return inv;
}

/**
 * Create an invoice tracking record pre-populated from an approved estimate.
 * Also snapshots active customer-visible estimate items into helcim_invoice_items.
 */
export async function createHelcimInvoiceFromEstimate(estimateId, extraData = {}) {
  // Fetch estimate
  const { data: est, error: estErr } = await supabase
    .from("estimates")
    .select("id, repair_order_id, subtotal_cents, tax_cents, total_cents, approved_total_cents, status")
    .eq("id", estimateId).single();
  if (estErr) throw estErr;

  // Prefer approved total if available
  const useApproved = est.approved_total_cents > 0;
  const totalCents  = useApproved ? est.approved_total_cents : est.total_cents;
  const subCents    = useApproved ? Math.round(totalCents / 1.05) : est.subtotal_cents;
  const taxCents    = totalCents - subCents;

  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));

  // Create invoice row
  const { data: inv, error: invErr } = await supabase
    .from("helcim_invoices")
    .insert([{
      repair_order_id:  est.repair_order_id,
      estimate_id:      estimateId,
      status:           extraData.status           ?? "draft",
      payment_status:   extraData.payment_status   ?? "unpaid",
      subtotal_cents:   subCents,
      tax_cents:        taxCents,
      total_cents:      totalCents,
      amount_paid_cents: 0,
      amount_due_cents:  totalCents,
      currency:         "CAD",
      helcim_invoice_id:     extraData.helcim_invoice_id     ?? null,
      helcim_invoice_number: extraData.helcim_invoice_number ?? null,
      helcim_customer_id:    extraData.helcim_customer_id    ?? null,
      helcim_payment_link:   extraData.helcim_payment_link   ?? null,
      issued_at:  extraData.issued_at  ?? null,
      due_at:     extraData.due_at     ?? null,
      notes:      extraData.notes      ?? null,
      created_by: session?.user?.id   ?? null,
    }])
    .select().single();
  if (invErr) {
    if (import.meta.env.DEV) console.error("[createHelcimInvoiceFromEstimate] insert:", invErr);
    throw invErr;
  }

  // Snapshot estimate items
  await createHelcimInvoiceItemsFromEstimate(inv.id, estimateId).catch((e) => {
    if (import.meta.env.DEV) console.warn("[createHelcimInvoiceFromEstimate] item snapshot failed:", e);
  });

  return inv;
}

/** Snapshot active customer-visible estimate items into helcim_invoice_items. */
export async function createHelcimInvoiceItemsFromEstimate(invoiceId, estimateId) {
  const { data: items } = await supabase
    .from("estimate_items")
    .select("id, description, quantity, unit_price_cents, line_total_cents, item_type, sort_order, approval_status")
    .eq("estimate_id", estimateId)
    .eq("is_active", true)
    .eq("is_customer_visible", true)
    .order("sort_order", { ascending: true });

  if (!items?.length) return [];

  const snapshots = items.map((i) => ({
    helcim_invoice_id: invoiceId,
    estimate_item_id:  i.id,
    description:       i.description,
    quantity:          i.quantity,
    unit_price_cents:  i.unit_price_cents,
    line_total_cents:  i.line_total_cents,
    item_type:         i.item_type,
    sort_order:        i.sort_order,
  }));

  const { data, error } = await supabase
    .from("helcim_invoice_items").insert(snapshots).select();
  if (error) throw error;
  return data;
}

/** Create a single helcim_invoice_items snapshot. */
export async function createHelcimInvoiceItemSnapshot(invoiceId, itemData) {
  const { data, error } = await supabase
    .from("helcim_invoice_items")
    .insert([{ helcim_invoice_id: invoiceId, ...itemData }])
    .select().single();
  if (error) throw error;
  return data;
}

/** List all line item snapshots for an invoice. */
export async function listHelcimInvoiceItems(invoiceId) {
  const { data, error } = await supabase
    .from("helcim_invoice_items").select("*")
    .eq("helcim_invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Update editable fields on a helcim invoice. */
export async function updateHelcimInvoice(invoiceId, fields) {
  const payload = {};
  for (const k of HELCIM_INV_EDITABLE) if (k in fields) payload[k] = fields[k] ?? null;

  const { data, error } = await supabase
    .from("helcim_invoices").update(payload).eq("id", invoiceId).select().single();
  if (error) {
    if (import.meta.env.DEV) console.error("[updateHelcimInvoice]", error);
    throw error;
  }
  return data;
}

/** Update invoice workflow status. */
export async function updateHelcimInvoiceStatus(invoiceId, status) {
  const extra = {};
  if (status === "voided") extra.voided_at = new Date().toISOString();
  return updateHelcimInvoice(invoiceId, { status, ...extra });
}

/**
 * Update payment status and amounts, then sync repair_orders.payment_status.
 *
 * repair_orders.payment_status only accepts: 'unpaid' | 'partial' | 'paid'
 * helcim_invoices.payment_status also allows: 'refunded' | 'failed' | 'voided'
 * Map invoice-only values to the closest valid RO value (or skip RO update).
 */
export async function updateHelcimPaymentStatus(invoiceId, paymentStatus, paymentData = {}) {
  const now = new Date().toISOString();

  // 1. Fetch current invoice in ONE query — repair_order_id, amounts, and all timestamps
  const { data: curr, error: fetchErr } = await supabase
    .from("helcim_invoices")
    .select("repair_order_id, total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .single();

  if (fetchErr) {
    if (import.meta.env.DEV) console.error("[updateHelcimPaymentStatus] fetch error:", fetchErr);
    throw fetchErr;
  }

  const totalCents = curr?.total_cents ?? 0;

  // 2. Build the patch
  const patch = { payment_status: paymentStatus };

  switch (paymentStatus) {
    case "paid":
      patch.amount_paid_cents = totalCents;
      patch.amount_due_cents  = 0;
      patch.paid_at           = paymentData.paid_at ?? now;
      break;

    case "partial": {
      const paidAmt = paymentData.amount_paid_cents ?? curr.amount_paid_cents ?? 0;
      patch.amount_paid_cents = paidAmt;
      patch.amount_due_cents  = Math.max(0, totalCents - paidAmt);
      break;
    }

    case "unpaid":
      patch.amount_paid_cents = 0;
      patch.amount_due_cents  = totalCents;
      patch.paid_at           = null;
      break;

    case "voided":
      patch.voided_at         = paymentData.voided_at ?? now;
      patch.amount_due_cents  = 0;
      break;

    case "refunded":
    case "failed":
      // Keep amounts as-is; only update the status field
      break;

    default:
      if (import.meta.env.DEV) console.warn("[updateHelcimPaymentStatus] unknown status:", paymentStatus);
  }

  // 3. Update the invoice first — if this fails, we stop before touching RO
  const updated = await updateHelcimInvoice(invoiceId, patch);

  // 4. Sync repair_orders.payment_status (only valid RO values)
  //    repair_orders constraint: payment_status in ('unpaid','partial','paid')
  const RO_STATUS_MAP = {
    unpaid:   "unpaid",
    partial:  "partial",
    paid:     "paid",
    refunded: "partial",   // closest valid value — money was returned but RO existed
    failed:   "unpaid",    // payment failed, treat as unpaid
    voided:   null,        // voided invoice: do not change RO payment status
  };
  const roPayStatus = RO_STATUS_MAP[paymentStatus];

  if (roPayStatus !== null && curr?.repair_order_id) {
    const { error: roErr } = await supabase
      .from("repair_orders")
      .update({ payment_status: roPayStatus })
      .eq("id", curr.repair_order_id);

    if (roErr && import.meta.env.DEV) {
      console.warn("[updateHelcimPaymentStatus] RO sync failed (non-fatal):", roErr);
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────
// ESTIMATES
// ─────────────────────────────────────────────────────────────

const GST_RATE = 0.05; // Alberta GST — 5%

/** Money helper: convert dollar string/number input to integer cents. */
function dollarsToCents(dollars) {
  return Math.round((parseFloat(dollars) || 0) * 100);
}

/** Recalculate and persist estimate subtotal/tax/total from active items. */
export async function recalculateEstimateTotals(estimateId) {
  const { data: items } = await supabase
    .from("estimate_items")
    .select("line_total_cents, item_type")
    .eq("estimate_id", estimateId)
    .eq("is_active", true);

  let subtotal = 0;
  for (const item of (items || [])) {
    subtotal += item.item_type === "discount"
      ? -(item.line_total_cents ?? 0)
      :  (item.line_total_cents ?? 0);
  }
  subtotal = Math.max(0, subtotal);
  const tax   = Math.round(subtotal * GST_RATE);
  const total = subtotal + tax;

  const { data, error } = await supabase
    .from("estimates")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: total })
    .eq("id", estimateId)
    .select("id, subtotal_cents, tax_cents, total_cents, approved_total_cents")
    .single();

  if (error) throw error;
  return data;
}

/** List all estimates with RO, customer, and vehicle joined. */
export async function listEstimates() {
  const { data, error } = await supabase
    .from("estimates")
    .select(`
      id, estimate_number, status, subtotal_cents, tax_cents, total_cents,
      approved_total_cents, created_at, repair_order_id,
      repair_orders (
        id, ro_number,
        customers (first_name, last_name),
        vehicles   (year, make, model)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get the most recent estimate for a repair order (null if none).
 * Repair orders can have multiple estimates; returns the newest.
 */
export async function getEstimateByRepairOrder(repairOrderId) {
  const { data, error } = await supabase
    .from("estimates")
    .select("id, estimate_number, status, total_cents")
    .eq("repair_order_id", repairOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Get full estimate detail with active items and RO/customer/vehicle context.
 * Uses separate queries to avoid PostgREST join ambiguity.
 */
export async function getEstimate(estimateId) {
  const { data: est, error } = await supabase
    .from("estimates").select("*").eq("id", estimateId).single();
  if (error) throw error;

  const [itemsRes, jobsRes] = await Promise.all([
    supabase.from("estimate_items").select("*")
      .eq("estimate_id", estimateId).eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("estimate_jobs").select("*")
      .eq("estimate_id", estimateId).eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  let ro = null, customer = null, vehicle = null;
  if (est.repair_order_id) {
    const { data: roData } = await supabase
      .from("repair_orders").select("id, ro_number, customer_id, vehicle_id")
      .eq("id", est.repair_order_id).single();
    ro = roData;
    if (ro?.customer_id) {
      const { data } = await supabase.from("customers")
        .select("id, first_name, last_name, email, phone").eq("id", ro.customer_id).single();
      customer = data;
    }
    if (ro?.vehicle_id) {
      const { data } = await supabase.from("vehicles")
        .select("id, year, make, model").eq("id", ro.vehicle_id).single();
      vehicle = data;
    }
  }

  return { ...est, items: itemsRes.data || [], jobs: jobsRes.data || [], ro, customer, vehicle };
}

/** Create a draft estimate for a repair order. */
export async function createEstimateForRepairOrder(repairOrderId, { title, customerMessage } = {}) {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const roRes = await supabase.from("repair_orders")
    .select("ro_number").eq("id", repairOrderId).single();
  const roNumber = roRes.data?.ro_number ?? "";

  const { data, error } = await supabase
    .from("estimates")
    .insert([{
      repair_order_id:  repairOrderId,
      title:            title || `Estimate for ${roNumber}`,
      customer_message: customerMessage || null,
      status:           "draft",
      created_by:       session?.user?.id ?? null,
    }])
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createEstimateForRepairOrder]", error);
    throw error;
  }
  return data;
}

/** Update estimate meta fields (title, customer_message, expires_at). */
export async function updateEstimate(estimateId, fields) {
  const ALLOWED = ["title","customer_message","status","sent_at","approved_at","declined_at","expires_at","approved_total_cents"];
  const payload = {};
  for (const k of ALLOWED) if (k in fields) payload[k] = fields[k] ?? null;

  const { data, error } = await supabase
    .from("estimates").update(payload).eq("id", estimateId).select().single();
  if (error) throw error;
  return data;
}

/** Update estimate status and set relevant timestamps. */
export async function updateEstimateStatus(estimateId, newStatus) {
  const now = new Date().toISOString();
  const extra = {};
  if (newStatus === "sent")     extra.sent_at     = now;
  if (newStatus === "approved") extra.approved_at = now;
  if (newStatus === "declined") extra.declined_at = now;

  return updateEstimate(estimateId, { status: newStatus, ...extra });
}

/** List all active estimate items for an estimate. */
export async function listEstimateItems(estimateId) {
  const { data, error } = await supabase
    .from("estimate_items").select("*")
    .eq("estimate_id", estimateId).eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Create a new estimate line item.
 * Accepts unit_price in dollars; converts to cents before storing.
 * Phase 13D: also accepts cost_dollars and markup_percent (staff-only internal pricing).
 * Phase 15A: also accepts markup_type ('percent'|'fixed') and markup_value_dollars/cents.
 * customer_unit_price_cents mirrors unit_price_cents for the authoritative customer price.
 */
export async function createEstimateItem(estimateId, repairOrderId, itemData) {
  const qty       = Math.max(0, parseFloat(itemData.quantity) || 0);
  const unitCents = dollarsToCents(itemData.unit_price_dollars ?? itemData.unit_price_cents / 100 ?? 0);
  const lineCents = Math.round(qty * unitCents);

  // Staff-only internal pricing fields (Phase 13D / 15A)
  const costCents = (itemData.cost_dollars != null && itemData.cost_dollars !== "")
    ? dollarsToCents(itemData.cost_dollars)
    : null;
  const markupPct = (itemData.markup_percent != null && itemData.markup_percent !== "")
    ? parseFloat(itemData.markup_percent)
    : null;
  const markupType = itemData.markup_type ?? "percent";
  const markupValueCents =
    markupType === "fixed" && itemData.markup_value_dollars != null && itemData.markup_value_dollars !== ""
      ? dollarsToCents(itemData.markup_value_dollars)
      : markupType === "fixed" && itemData.markup_value_cents != null
      ? itemData.markup_value_cents
      : null;

  const { data, error } = await supabase
    .from("estimate_items")
    .insert([{
      estimate_id:               estimateId,
      repair_order_id:           repairOrderId,
      item_type:                 itemData.item_type     ?? "labor",
      description:               itemData.description,
      quantity:                  qty,
      unit_price_cents:          unitCents,
      customer_unit_price_cents: unitCents,   // mirrors unit_price_cents
      cost_cents:                costCents,
      markup_type:               markupType,
      markup_percent:            markupType === "percent" ? markupPct : null,
      markup_value_cents:        markupValueCents,
      line_total_cents:          lineCents,
      is_required:               itemData.is_required         ?? false,
      is_customer_visible:       itemData.is_customer_visible ?? true,
      notes:                     itemData.notes               || null,
      sort_order:                itemData.sort_order          ?? 0,
      estimate_job_id:           itemData.estimate_job_id     ?? null,
      is_active:                 true,
    }])
    .select().single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createEstimateItem]", error);
    throw error;
  }

  await recalculateEstimateTotals(estimateId).catch(() => {});
  return data;
}

/**
 * Update an estimate line item. Recalculates line_total_cents from qty × unit_price.
 * Accepts unit_price in dollars via unit_price_dollars, or raw cents via unit_price_cents.
 * Phase 13D: also accepts cost_dollars and markup_percent (staff-only internal pricing).
 * Phase 15A: also accepts markup_type and markup_value_dollars/cents.
 */
export async function updateEstimateItem(itemId, estimateId, itemData) {
  const ALLOWED = ["item_type","description","quantity","unit_price_cents",
                   "customer_unit_price_cents","cost_cents","markup_type","markup_percent","markup_value_cents",
                   "is_required","is_customer_visible","notes","approval_status","sort_order",
                   "estimate_job_id"];
  const payload = {};
  for (const k of ALLOWED) if (k in itemData) payload[k] = itemData[k] ?? null;

  // Convert dollars to cents if caller used dollar fields
  if ("unit_price_dollars" in itemData) {
    payload.unit_price_cents = dollarsToCents(itemData.unit_price_dollars);
  }
  if ("cost_dollars" in itemData) {
    payload.cost_cents = (itemData.cost_dollars != null && itemData.cost_dollars !== "")
      ? dollarsToCents(itemData.cost_dollars)
      : null;
  }
  if ("markup_percent" in itemData) {
    payload.markup_percent = (itemData.markup_percent != null && itemData.markup_percent !== "")
      ? parseFloat(itemData.markup_percent)
      : null;
  }
  if ("markup_value_dollars" in itemData) {
    payload.markup_value_cents = (itemData.markup_value_dollars != null && itemData.markup_value_dollars !== "")
      ? dollarsToCents(itemData.markup_value_dollars)
      : null;
  }
  // Null out the unused markup column when type is explicitly set
  if ("markup_type" in itemData) {
    if (itemData.markup_type === "fixed") {
      if (!("markup_percent" in payload))      payload.markup_percent     = null;
    } else {
      if (!("markup_value_cents" in payload))  payload.markup_value_cents = null;
    }
  }

  // Recalculate line total from customer-facing unit price × qty
  const qty       = parseFloat(payload.quantity        ?? itemData.quantity)        ?? 1;
  const unitCents = parseInt(payload.unit_price_cents ?? itemData.unit_price_cents) ?? 0;
  payload.line_total_cents          = Math.round(Math.max(0, qty) * Math.max(0, unitCents));
  payload.customer_unit_price_cents = Math.max(0, unitCents); // always mirror

  const { data, error } = await supabase
    .from("estimate_items").update(payload).eq("id", itemId).select().single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateEstimateItem]", error);
    throw error;
  }

  await recalculateEstimateTotals(estimateId).catch(() => {});
  return data;
}

/** Soft-hide an estimate item (is_active = false). Recalculates totals. */
export async function softHideEstimateItem(itemId, estimateId) {
  const { data, error } = await supabase
    .from("estimate_items").update({ is_active: false }).eq("id", itemId).select().single();
  if (error) throw error;
  await recalculateEstimateTotals(estimateId).catch(() => {});
  return data;
}

// ─────────────────────────────────────────────────────────────
// ESTIMATE JOBS
// ─────────────────────────────────────────────────────────────

/** List active job sections for an estimate, ordered by sort_order. */
export async function listEstimateJobs(estimateId) {
  const { data, error } = await supabase
    .from("estimate_jobs").select("*")
    .eq("estimate_id", estimateId).eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Create a new job section for an estimate. */
export async function createEstimateJob(estimateId, { title, notes, sort_order, repair_order_concern_id } = {}) {
  const { data, error } = await supabase
    .from("estimate_jobs")
    .insert([{
      estimate_id:             estimateId,
      title:                   title?.trim() || "New Job",
      notes:                   notes || null,
      sort_order:              sort_order ?? 0,
      repair_order_concern_id: repair_order_concern_id ?? null,
      is_active:               true,
    }])
    .select().single();
  if (error) throw error;
  return data;
}

/** Update a job section's title, notes, or sort_order. */
export async function updateEstimateJob(id, fields) {
  const ALLOWED = ["title", "notes", "sort_order"];
  const payload = {};
  for (const k of ALLOWED) if (k in fields) payload[k] = fields[k] ?? null;
  if ("title" in payload && !payload.title?.trim()) payload.title = "Job";
  const { data, error } = await supabase
    .from("estimate_jobs").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** Soft-hide a job section (is_active = false). Items keep their estimate_job_id. */
export async function softHideEstimateJob(id) {
  const { data, error } = await supabase
    .from("estimate_jobs").update({ is_active: false }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** Set estimate_job_id = null on all active items belonging to a job section.
 *  Does NOT recalculate prices — only clears the grouping column. */
export async function ungroupEstimateJobItems(estimateJobId) {
  const { error } = await supabase
    .from("estimate_items")
    .update({ estimate_job_id: null })
    .eq("estimate_job_id", estimateJobId)
    .eq("is_active", true);
  if (error) throw error;
}

/**
 * Idempotent: if the estimate already has active job sections, return them unchanged.
 * Otherwise, fetch active repair_order_concerns for the RO and create one job per concern.
 * Returns the resulting array of active jobs (existing or newly created).
 */
export async function ensureEstimateJobsFromRepairOrder(estimateId, repairOrderId) {
  const existing = await listEstimateJobs(estimateId);
  if (existing.length > 0) return existing;

  const { data: concerns } = await supabase
    .from("repair_order_concerns")
    .select("id, concern_text, sort_order")
    .eq("repair_order_id", repairOrderId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!concerns?.length) return [];

  const rows = concerns.map((c) => ({
    estimate_id:             estimateId,
    repair_order_concern_id: c.id,
    title:                   c.concern_text,
    notes:                   null,
    sort_order:              c.sort_order,
    is_active:               true,
  }));

  const { data: created, error } = await supabase
    .from("estimate_jobs").insert(rows).select()
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return created ?? [];
}

// ─────────────────────────────────────────────────────────────
// INSPECTIONS
// ─────────────────────────────────────────────────────────────

const ALLOWED_PHOTO_TYPES = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
const MAX_PHOTO_BYTES = 52428800; // 50 MB

const DEFAULT_INSPECTION_ITEMS = [
  // Tires & Wheels
  { category:"Tires & Wheels", item_name:"Front Left Tire",       sort_order:10 },
  { category:"Tires & Wheels", item_name:"Front Right Tire",      sort_order:20 },
  { category:"Tires & Wheels", item_name:"Rear Left Tire",        sort_order:30 },
  { category:"Tires & Wheels", item_name:"Rear Right Tire",       sort_order:40 },
  { category:"Tires & Wheels", item_name:"Tire Pressure",         sort_order:50 },
  { category:"Tires & Wheels", item_name:"Wheel Nuts / Lug Nuts", sort_order:60 },
  // Brakes
  { category:"Brakes", item_name:"Front Brake Pads", sort_order:10 },
  { category:"Brakes", item_name:"Rear Brake Pads",  sort_order:20 },
  { category:"Brakes", item_name:"Brake Rotors",     sort_order:30 },
  { category:"Brakes", item_name:"Brake Fluid",      sort_order:40 },
  // Fluids
  { category:"Fluids", item_name:"Engine Oil",             sort_order:10 },
  { category:"Fluids", item_name:"Coolant",                sort_order:20 },
  { category:"Fluids", item_name:"Transmission Fluid",     sort_order:30 },
  { category:"Fluids", item_name:"Washer Fluid",           sort_order:40 },
  { category:"Fluids", item_name:"Power Steering Fluid",   sort_order:50 },
  // Lights
  { category:"Lights", item_name:"Headlights",    sort_order:10 },
  { category:"Lights", item_name:"Brake Lights",  sort_order:20 },
  { category:"Lights", item_name:"Turn Signals",  sort_order:30 },
  { category:"Lights", item_name:"Reverse Lights",sort_order:40 },
  // Engine Bay
  { category:"Engine Bay", item_name:"Battery",    sort_order:10 },
  { category:"Engine Bay", item_name:"Belts",      sort_order:20 },
  { category:"Engine Bay", item_name:"Hoses",      sort_order:30 },
  { category:"Engine Bay", item_name:"Air Filter", sort_order:40 },
  // Suspension & Steering
  { category:"Suspension & Steering", item_name:"Shocks / Struts", sort_order:10 },
  { category:"Suspension & Steering", item_name:"Ball Joints",     sort_order:20 },
  { category:"Suspension & Steering", item_name:"Tie Rods",        sort_order:30 },
  // Under Vehicle
  { category:"Under Vehicle", item_name:"Exhaust System",   sort_order:10 },
  { category:"Under Vehicle", item_name:"Leaks",            sort_order:20 },
  { category:"Under Vehicle", item_name:"Rust / Corrosion", sort_order:30 },
  // Other
  { category:"Other", item_name:"Wipers",           sort_order:10 },
  { category:"Other", item_name:"Cabin Air Filter", sort_order:20 },
  { category:"Other", item_name:"Road Test Notes",  sort_order:30 },
];

/** List all inspections with RO, customer, and vehicle joined. */
export async function listInspections() {
  const { data, error } = await supabase
    .from("inspections")
    .select(`
      id, status, completed_at, sent_to_customer_at, created_at, repair_order_id,
      repair_orders (
        id, ro_number,
        customers (first_name, last_name),
        vehicles   (year, make, model)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get a single inspection's full detail: record + items.
 * RO/customer/vehicle info fetched separately to avoid PostgREST join ambiguity.
 */
export async function getInspection(inspectionId) {
  const { data: insp, error: inspErr } = await supabase
    .from("inspections").select("*").eq("id", inspectionId).single();
  if (inspErr) throw inspErr;

  const { data: items } = await supabase
    .from("inspection_items").select("*")
    .eq("inspection_id", inspectionId)
    .order("sort_order", { ascending: true });

  let ro = null, customer = null, vehicle = null;
  if (insp.repair_order_id) {
    const { data: roData } = await supabase
      .from("repair_orders").select("id, ro_number, customer_id, vehicle_id")
      .eq("id", insp.repair_order_id).single();
    ro = roData;
    if (ro?.customer_id) {
      const { data } = await supabase.from("customers")
        .select("id, first_name, last_name").eq("id", ro.customer_id).single();
      customer = data;
    }
    if (ro?.vehicle_id) {
      const { data } = await supabase.from("vehicles")
        .select("id, year, make, model").eq("id", ro.vehicle_id).single();
      vehicle = data;
    }
  }

  return { ...insp, items: items || [], ro, customer, vehicle };
}

/**
 * Check if a repair order already has an inspection.
 * Returns null if not found (PGRST116 = no rows).
 */
export async function getInspectionByRepairOrder(repairOrderId) {
  const { data, error } = await supabase
    .from("inspections")
    .select("id, status, completed_at")
    .eq("repair_order_id", repairOrderId)
    .maybeSingle(); // maybeSingle() returns null cleanly when no rows exist — no PGRST116 error

  if (error) throw error;
  return data ?? null;
}

/** Create a new inspection for a repair order. */
export async function createInspectionForRepairOrder(repairOrderId) {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));

  const { data, error } = await supabase
    .from("inspections")
    .insert([{
      repair_order_id: repairOrderId,
      status:          "draft",
      created_by:      session?.user?.id ?? null,
    }])
    .select().single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createInspectionForRepairOrder]", error);
    throw error;
  }
  return data;
}

/** Bulk-insert the default checklist items for a new inspection. */
export async function createDefaultInspectionItems(inspectionId) {
  const rows = DEFAULT_INSPECTION_ITEMS.map((item) => ({
    inspection_id:       inspectionId,
    category:            item.category,
    item_name:           item.item_name,
    condition:           "not_checked",
    sort_order:          item.sort_order,
    is_customer_visible: true,
  }));

  const { data, error } = await supabase
    .from("inspection_items").insert(rows).select();

  if (error) {
    if (import.meta.env.DEV) console.error("[createDefaultInspectionItems]", error);
    throw error;
  }
  return data;
}

/** Update overall inspection fields (notes, status timestamps). */
export async function updateInspection(inspectionId, fields) {
  const ALLOWED = ["status","overall_notes","customer_visible_notes","completed_at","sent_to_customer_at"];
  const payload = {};
  for (const k of ALLOWED) if (k in fields) payload[k] = fields[k] ?? null;

  const { data, error } = await supabase
    .from("inspections").update(payload).eq("id", inspectionId).select().single();
  if (error) {
    if (import.meta.env.DEV) console.error("[updateInspection]", error);
    throw error;
  }
  return data;
}

/** Update inspection status and set relevant timestamps. */
export async function updateInspectionStatus(inspectionId, newStatus) {
  const now = new Date().toISOString();
  const extra = {};
  if (newStatus === "completed")         extra.completed_at         = now;
  if (newStatus === "sent_to_customer")  extra.sent_to_customer_at  = now;

  return updateInspection(inspectionId, { status: newStatus, ...extra });
}

/** Update a single inspection item's condition, notes, etc. */
export async function updateInspectionItem(itemId, fields) {
  const ALLOWED = ["condition","notes","recommendation","is_customer_visible","sort_order"];
  const payload = {};
  for (const k of ALLOWED) if (k in fields) payload[k] = fields[k] ?? null;

  const { data, error } = await supabase
    .from("inspection_items").update(payload).eq("id", itemId).select().single();
  if (error) {
    if (import.meta.env.DEV) console.error("[updateInspectionItem]", error);
    throw error;
  }
  return data;
}

/** Create a new custom inspection item. */
export async function createInspectionItem(inspectionId, itemData) {
  const { data, error } = await supabase
    .from("inspection_items")
    .insert([{
      inspection_id:       inspectionId,
      category:            itemData.category,
      item_name:           itemData.item_name,
      condition:           itemData.condition ?? "not_checked",
      notes:               itemData.notes ?? null,
      sort_order:          itemData.sort_order ?? 99,
      is_customer_visible: itemData.is_customer_visible ?? true,
    }])
    .select().single();
  if (error) throw error;
  return data;
}

/** List all active photos for an inspection. */
export async function listInspectionPhotos(inspectionId) {
  const { data, error } = await supabase
    .from("inspection_photos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Get a short-lived signed URL for staff photo preview (10 minutes). */
export async function getSignedPhotoUrl(storagePath, expiresIn = 600) {
  const { data, error } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Upload a photo to the private inspection-photos bucket and record metadata.
 * Never stores a full URL — only the storage_path is saved to the database.
 */
export async function uploadInspectionPhoto({
  inspectionId, inspectionItemId, repairOrderId, file, caption,
}) {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    throw new Error(`File type not allowed. Use JPEG, PNG, WebP, HEIC, or HEIF.`);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(`File is too large. Maximum size is 50 MB.`);
  }

  // Build a safe, unique storage path
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `repair-orders/${repairOrderId}/inspections/${inspectionId}/${Date.now()}-${safeName}`;

  // Upload to the private bucket
  const { error: uploadErr } = await supabase.storage
    .from("inspection-photos")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) {
    if (import.meta.env.DEV) console.error("[uploadInspectionPhoto] storage upload:", uploadErr);
    throw uploadErr;
  }

  // Record metadata — storage_path only, never a full URL
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const { data, error: dbErr } = await supabase
    .from("inspection_photos")
    .insert([{
      inspection_id:       inspectionId,
      inspection_item_id:  inspectionItemId ?? null,
      repair_order_id:     repairOrderId,
      storage_bucket:      "inspection-photos",
      storage_path:        storagePath,
      file_name:           file.name,
      mime_type:           file.type,
      size_bytes:          file.size,
      caption:             caption ?? null,
      is_customer_visible: true,
      is_active:           true,
      uploaded_by:         session?.user?.id ?? null,
    }])
    .select().single();

  if (dbErr) {
    if (import.meta.env.DEV) console.error("[uploadInspectionPhoto] db insert:", dbErr);
    throw dbErr;
  }
  return data;
}

/** Update caption or visibility on a photo. */
export async function updateInspectionPhoto(photoId, { caption, is_customer_visible }) {
  const payload = {};
  if (caption              !== undefined) payload.caption              = caption;
  if (is_customer_visible  !== undefined) payload.is_customer_visible  = is_customer_visible;

  const { data, error } = await supabase
    .from("inspection_photos").update(payload).eq("id", photoId).select().single();
  if (error) throw error;
  return data;
}

/** Soft-hide a photo without physical deletion. */
export async function softHideInspectionPhoto(photoId) {
  const { data, error } = await supabase
    .from("inspection_photos").update({ is_active: false }).eq("id", photoId).select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY LOGS
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// APPOINTMENT REQUESTS
// ─────────────────────────────────────────────────────────────

const APPT_COLUMNS = [
  "source", "name", "phone", "email",
  "vehicle_info", "service_requested", "preferred_date", "notes",
  "status", "customer_id", "vehicle_id", "repair_order_id",
  // Scheduling fields (Phase 17A):
  "scheduled_start", "scheduled_end", "scheduled_service",
  "reply_message", "replied_at", "confirmed_at", "cancelled_at",
];

/** Fetch all appointment requests ordered newest first. */
export async function listAppointmentRequests() {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** Fetch a single appointment request by ID. */
export async function getAppointmentRequest(id) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a manual appointment request (phone or walk-in entry by staff).
 * Do not use this for public web form submissions — those go through the
 * Netlify Function server-side.
 */
export async function createAppointmentRequest(apptData) {
  const fields = {};
  for (const col of APPT_COLUMNS) {
    const val = apptData[col];
    fields[col] = (typeof val === "string" && val.trim() === "") ? null : (val ?? null);
  }
  if (fields.name)  fields.name  = fields.name.trim();
  if (fields.phone) fields.phone = fields.phone.trim();

  const { data, error } = await supabase
    .from("appointment_requests")
    .insert([fields])
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[createAppointmentRequest] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Update editable fields on an appointment request. */
export async function updateAppointmentRequest(id, apptData) {
  const fields = {};
  for (const col of APPT_COLUMNS) {
    const val = apptData[col];
    fields[col] = (typeof val === "string" && val.trim() === "") ? null : (val ?? null);
  }

  const { data, error } = await supabase
    .from("appointment_requests")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateAppointmentRequest] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Change only the status field on an appointment request.
 *  Automatically sets confirmed_at or cancelled_at when transitioning
 *  to those terminal states. */
export async function updateAppointmentRequestStatus(id, status) {
  const fields = { status };
  const now = new Date().toISOString();
  if (status === "confirmed") fields.confirmed_at = now;
  if (status === "cancelled") fields.cancelled_at = now;

  const { data, error } = await supabase
    .from("appointment_requests")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateAppointmentRequestStatus] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Save scheduling date/time fields without changing status.
 *  Calling this makes the appointment appear on the calendar. */
export async function saveAppointmentSchedule(id, { scheduledStart, scheduledEnd, scheduledService }) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .update({
      scheduled_start:   scheduledStart   || null,
      scheduled_end:     scheduledEnd     || null,
      scheduled_service: scheduledService || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[saveAppointmentSchedule] Supabase error:", error);
    throw error;
  }
  return data;
}

/** Confirm an appointment: set status=confirmed, confirmed_at, and scheduling fields in one call. */
export async function confirmAppointmentRequest(id, { scheduledStart, scheduledEnd, scheduledService }) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .update({
      status:            "confirmed",
      confirmed_at:      new Date().toISOString(),
      scheduled_start:   scheduledStart   || null,
      scheduled_end:     scheduledEnd     || null,
      scheduled_service: scheduledService || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[confirmAppointmentRequest] Supabase error:", error);
    throw error;
  }
  return data;
}

/**
 * Call the send-appointment-reply Netlify Function to email a reply to the
 * customer. The function also saves reply_message + replied_at on the row.
 *
 * Returns { sent: true } on success.
 * Returns { noEmail: true } when the appointment has no email address.
 * Throws on any other error.
 */
export async function sendAppointmentReply(appointmentId, replyMessage) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch("/.netlify/functions/send-appointment-reply", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ appointmentId, replyMessage }),
  });

  const json = await res.json().catch(() => ({}));
  if (res.status === 400 && json.code === "NO_EMAIL") return { noEmail: true };
  if (!res.ok) throw new Error(json.message || "Failed to send reply");
  return { sent: true };
}

/**
 * Append an activity log entry.
 * Errors are swallowed — a failed log must never break the main action.
 *
 * @param {string} action      e.g. 'customer.created'
 * @param {string} entityType  e.g. 'customer'
 * @param {string} entityId    UUID of the affected record
 * @param {object} details     Optional context (name, make/model, etc.)
 */
export async function logActivity(action, entityType, entityId, details = null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const staffUserId = session?.user?.id ?? null;

    await supabase.from("activity_logs").insert([{
      staff_user_id: staffUserId,
      action,
      entity_type: entityType,
      entity_id:   entityId,
      details:     details ? JSON.stringify(details) : null,
    }]);
  } catch {
    // Intentionally silent — logging failure should never surface to the user
  }
}

// ─────────────────────────────────────────────────────────────
// SERVICE HISTORY (Phase 13C — read-only)
// ─────────────────────────────────────────────────────────────

/**
 * Read-only consolidated service history for a customer.
 * Returns the customer, their vehicles, all repair orders, and the
 * concerns/inspections/estimates/invoices associated with those ROs.
 * Uses separate queries to avoid PostgREST join ambiguity.
 */
export async function getCustomerServiceHistory(customerId) {
  // 1. Customer
  const { data: customer, error: custErr } = await supabase
    .from("customers").select("*").eq("id", customerId).single();
  if (custErr) throw custErr;

  // 2. Active vehicles
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, color, license_plate, plate_province")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("make", { ascending: true });

  // 3. All repair orders for this customer (newest first)
  const { data: repairOrders } = await supabase
    .from("repair_orders")
    .select("id, ro_number, status, payment_status, mileage_in, mileage_out, promised_date, created_at, vehicle_id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const ros    = repairOrders ?? [];
  const roIds  = ros.map((r) => r.id);

  if (!roIds.length) {
    return {
      customer,
      vehicles:      vehicles     ?? [],
      repairOrders:  ros,
      concerns:      [],
      inspections:   [],
      estimates:     [],
      invoices:      [],
      recentActivity: [],
    };
  }

  // 4. Parallel fetches — all keyed by repair_order_id so the UI can group them
  const [concernsRes, inspectionsRes, estimatesRes, invoicesRes, activityRes] = await Promise.all([
    supabase.from("repair_order_concerns")
      .select("id, repair_order_id, concern_text, sort_order")
      .in("repair_order_id", roIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase.from("inspections")
      .select("id, repair_order_id, status, completed_at")
      .in("repair_order_id", roIds),

    supabase.from("estimates")
      .select("id, repair_order_id, estimate_number, status, total_cents, approved_total_cents, created_at")
      .in("repair_order_id", roIds)
      .order("created_at", { ascending: false }),

    supabase.from("helcim_invoices")
      .select("id, repair_order_id, helcim_invoice_number, status, payment_status, total_cents, amount_due_cents")
      .in("repair_order_id", roIds)
      .order("created_at", { ascending: false }),

    // Recent activity for the customer entity only (non-fatal)
    supabase.from("activity_logs")
      .select("id, action, entity_type, entity_id, created_at")
      .eq("entity_id", customerId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    customer,
    vehicles:      vehicles           ?? [],
    repairOrders:  ros,
    concerns:      concernsRes.data   ?? [],
    inspections:   inspectionsRes.data ?? [],
    estimates:     estimatesRes.data  ?? [],
    invoices:      invoicesRes.data   ?? [],
    recentActivity: activityRes.data  ?? [],
  };
}

/**
 * Read-only consolidated service history for a vehicle.
 * Returns the vehicle, its owner, all repair orders for this vehicle,
 * and the concerns/inspections/estimates/invoices linked to those ROs.
 */
export async function getVehicleServiceHistory(vehicleId) {
  // 1. Vehicle
  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, color, license_plate, plate_province, customer_id")
    .eq("id", vehicleId)
    .single();
  if (vehErr) throw vehErr;

  // 2. Owner (optional — maybeSingle avoids PGRST116 if somehow orphaned)
  let customer = null;
  if (vehicle.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .eq("id", vehicle.customer_id)
      .maybeSingle();
    customer = data ?? null;
  }

  // 3. Repair orders for this vehicle (newest first)
  const { data: repairOrders } = await supabase
    .from("repair_orders")
    .select("id, ro_number, status, payment_status, mileage_in, mileage_out, promised_date, created_at, vehicle_id")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  const ros   = repairOrders ?? [];
  const roIds = ros.map((r) => r.id);

  if (!roIds.length) {
    return { vehicle, customer, repairOrders: ros, concerns: [], inspections: [], estimates: [], invoices: [] };
  }

  const [concernsRes, inspectionsRes, estimatesRes, invoicesRes] = await Promise.all([
    supabase.from("repair_order_concerns")
      .select("id, repair_order_id, concern_text, sort_order")
      .in("repair_order_id", roIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase.from("inspections")
      .select("id, repair_order_id, status, completed_at")
      .in("repair_order_id", roIds),

    supabase.from("estimates")
      .select("id, repair_order_id, estimate_number, status, total_cents, approved_total_cents, created_at")
      .in("repair_order_id", roIds)
      .order("created_at", { ascending: false }),

    supabase.from("helcim_invoices")
      .select("id, repair_order_id, helcim_invoice_number, status, payment_status, total_cents, amount_due_cents")
      .in("repair_order_id", roIds)
      .order("created_at", { ascending: false }),
  ]);

  return {
    vehicle,
    customer,
    repairOrders: ros,
    concerns:     concernsRes.data    ?? [],
    inspections:  inspectionsRes.data ?? [],
    estimates:    estimatesRes.data   ?? [],
    invoices:     invoicesRes.data    ?? [],
  };
}

// ─────────────────────────────────────────────────────────────
// CANNED JOBS (Phase 13E)
// ─────────────────────────────────────────────────────────────

/** List all active canned job bundles, ordered by sort_order then name. */
export async function listCannedJobs() {
  const { data, error } = await supabase
    .from("canned_jobs")
    .select("id, name, description, category, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });
  if (error) throw error;
  return data;
}

/** List ALL canned job bundles including inactive, for management pages. */
export async function listAllCannedJobs() {
  const { data, error } = await supabase
    .from("canned_jobs")
    .select("id, name, description, category, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });
  if (error) throw error;
  return data;
}

/** Get a single canned job plus its items. */
export async function getCannedJob(id) {
  const [jobRes, itemsRes] = await Promise.all([
    supabase.from("canned_jobs")
      .select("id, name, description, category, sort_order, is_active")
      .eq("id", id)
      .single(),
    supabase.from("canned_job_items")
      .select("id, canned_job_id, item_type, description, quantity, cost_cents, markup_percent, unit_price_cents, customer_unit_price_cents, is_required, is_customer_visible, notes, sort_order")
      .eq("canned_job_id", id)
      .order("sort_order", { ascending: true }),
  ]);
  if (jobRes.error) throw jobRes.error;
  return { ...jobRes.data, items: itemsRes.data ?? [] };
}

/** Create a new canned job bundle. Returns the created row. */
export async function createCannedJob(data) {
  const ALLOWED = ["name", "description", "category", "sort_order"];
  const fields = {};
  for (const col of ALLOWED) {
    const v = data[col];
    fields[col] = (typeof v === "string" && v.trim() === "") ? null : (v ?? null);
  }
  if (fields.name) fields.name = fields.name.trim();
  if (fields.sort_order == null) fields.sort_order = 0;

  const { data: created, error } = await supabase
    .from("canned_jobs")
    .insert([fields])
    .select()
    .single();
  if (error) throw error;
  return created;
}

/** Update an existing canned job. Returns the updated row. */
export async function updateCannedJob(id, fields) {
  const ALLOWED = ["name", "description", "category", "sort_order", "is_active"];
  const payload = {};
  for (const col of ALLOWED) {
    if (col in fields) {
      const v = fields[col];
      payload[col] = (typeof v === "string" && v.trim() === "") ? null : v;
    }
  }
  if (payload.name) payload.name = payload.name.trim();

  const { data, error } = await supabase
    .from("canned_jobs")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-hide a canned job (sets is_active = false). Does not delete any rows. */
export async function softHideCannedJob(id) {
  return updateCannedJob(id, { is_active: false });
}

/** List all items for a given canned job, ordered by sort_order. */
export async function listCannedJobItems(cannedJobId) {
  const { data, error } = await supabase
    .from("canned_job_items")
    .select("id, canned_job_id, item_type, description, quantity, cost_cents, markup_percent, unit_price_cents, customer_unit_price_cents, is_required, is_customer_visible, notes, sort_order")
    .eq("canned_job_id", cannedJobId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

/** Create a new item inside a canned job. Returns the created row. */
export async function createCannedJobItem(cannedJobId, data) {
  const unitCents  = dollarsToCents(data.unit_price_dollars ?? 0);
  const costCents  = (data.cost_dollars != null && data.cost_dollars !== "")
    ? dollarsToCents(data.cost_dollars) : null;
  const markupPct  = (data.markup_percent != null && data.markup_percent !== "")
    ? parseFloat(data.markup_percent) : null;
  const markupType = data.markup_type ?? "percent";
  const markupValueCents =
    markupType === "fixed" && data.markup_value_dollars != null && data.markup_value_dollars !== ""
      ? dollarsToCents(data.markup_value_dollars)
      : markupType === "fixed" && data.markup_value_cents != null
      ? data.markup_value_cents
      : null;

  const { data: created, error } = await supabase
    .from("canned_job_items")
    .insert([{
      canned_job_id:             cannedJobId,
      item_type:                 data.item_type           ?? "labor",
      description:               data.description.trim(),
      quantity:                  parseFloat(data.quantity ?? 1),
      cost_cents:                costCents,
      markup_type:               markupType,
      markup_percent:            markupType === "percent" ? markupPct : null,
      markup_value_cents:        markupValueCents,
      unit_price_cents:          unitCents,
      customer_unit_price_cents: Math.max(0, unitCents),
      is_required:               data.is_required         ?? false,
      is_customer_visible:       data.is_customer_visible ?? true,
      notes:                     data.notes?.trim()        || null,
      sort_order:                data.sort_order           ?? 0,
    }])
    .select()
    .single();
  if (error) throw error;
  return created;
}

/** Update an existing canned job item. Returns the updated row. */
export async function updateCannedJobItem(id, data) {
  const ALLOWED = [
    "item_type", "description", "quantity",
    "unit_price_cents", "customer_unit_price_cents",
    "cost_cents", "markup_type", "markup_percent", "markup_value_cents",
    "is_required", "is_customer_visible", "notes", "sort_order",
  ];
  const payload = {};
  for (const col of ALLOWED) {
    if (col in data) payload[col] = data[col];
  }

  // Accept dollar-string inputs and convert
  if ("unit_price_dollars" in data) {
    payload.unit_price_cents          = dollarsToCents(data.unit_price_dollars ?? 0);
    payload.customer_unit_price_cents = Math.max(0, payload.unit_price_cents);
  }
  if ("cost_dollars" in data) {
    payload.cost_cents = (data.cost_dollars != null && data.cost_dollars !== "")
      ? dollarsToCents(data.cost_dollars) : null;
  }
  if ("markup_percent" in data && !(data.markup_percent == null || data.markup_percent === "")) {
    payload.markup_percent = parseFloat(data.markup_percent);
  }
  if ("markup_value_dollars" in data) {
    payload.markup_value_cents = (data.markup_value_dollars != null && data.markup_value_dollars !== "")
      ? dollarsToCents(data.markup_value_dollars)
      : null;
  }
  // Null out the unused markup column when type is explicitly set
  if ("markup_type" in data) {
    if (data.markup_type === "fixed") {
      if (!("markup_percent"     in payload)) payload.markup_percent     = null;
    } else {
      if (!("markup_value_cents" in payload)) payload.markup_value_cents = null;
    }
  }

  const { data: updated, error } = await supabase
    .from("canned_job_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return updated;
}

/**
 * Copy all items from a canned job bundle into an estimate as new line items.
 * Calls recalculateEstimateTotals after all inserts.
 * Returns the array of newly created estimate_item rows.
 * @param {string|null} estimateJobId - optional job section to assign all new items to
 */
export async function addCannedJobToEstimate(estimateId, repairOrderId, cannedJobId, estimateJobId = null) {
  // Fetch template items
  const items = await listCannedJobItems(cannedJobId);
  if (!items.length) return [];

  // Determine next sort_order base so new items appear at the end
  const { data: existing } = await supabase
    .from("estimate_items")
    .select("sort_order")
    .eq("estimate_id", estimateId)
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .limit(1);
  const baseSortOrder = ((existing?.[0]?.sort_order) ?? -1) + 1;

  // Build insert payload (preserves cost/markup/type, sets customer price = unit_price)
  const rows = items.map((item, idx) => ({
    estimate_id:               estimateId,
    repair_order_id:           repairOrderId,
    item_type:                 item.item_type,
    description:               item.description,
    quantity:                  item.quantity,
    cost_cents:                item.cost_cents,
    markup_type:               item.markup_type ?? "percent",
    markup_percent:            item.markup_percent,
    markup_value_cents:        item.markup_value_cents,
    unit_price_cents:          item.unit_price_cents,
    customer_unit_price_cents: item.customer_unit_price_cents ?? item.unit_price_cents,
    line_total_cents:          Math.round(item.quantity * item.unit_price_cents),
    is_required:               item.is_required,
    is_customer_visible:       item.is_customer_visible,
    notes:                     item.notes,
    approval_status:           "pending",
    sort_order:                baseSortOrder + idx,
    estimate_job_id:           estimateJobId ?? null,
    is_active:                 true,
  }));

  const { data: created, error } = await supabase
    .from("estimate_items")
    .insert(rows)
    .select();
  if (error) throw error;

  // Recalculate estimate totals
  await recalculateEstimateTotals(estimateId);

  return created;
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────

/**
 * Load all data needed for the portal dashboard in parallel.
 * Uses the authenticated frontend Supabase client — no service role key.
 */
export async function fetchDashboardData() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const [
    pendingAppts,
    activeROsRes,
    overdueROsRes,
    inspectionsRes,
    sentEstimatesRes,
    approvedEstimatesRes,
    unpaidInvoicesRes,
    syncErrorsRes,
    recentActivityRes,
    allROStatusesRes,
  ] = await Promise.all([
    // Pending appointment requests count
    supabase.from("appointment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    // Active repair orders (for list + count)
    supabase.from("repair_orders")
      .select(`id, ro_number, status, promised_date,
        customers (first_name, last_name),
        vehicles  (year, make, model)`)
      .in("status", ["active","in_progress","waiting_approval","approved"])
      .order("created_at", { ascending: false })
      .limit(8),

    // Promised ROs that are overdue (promised_date today or earlier, not done)
    supabase.from("repair_orders")
      .select(`id, ro_number, status, promised_date,
        customers (first_name, last_name),
        vehicles  (year, make, model)`)
      .lte("promised_date", today)
      .not("promised_date", "is", null)
      .not("status", "in", "(completed,closed,cancelled,invoiced)")
      .order("promised_date", { ascending: true })
      .limit(5),

    // In-progress inspections count
    supabase.from("inspections")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft","in_progress"]),

    // Sent estimates (waiting customer approval)
    supabase.from("estimates")
      .select(`id, estimate_number, status, total_cents, sent_at,
        repair_orders (ro_number)`)
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .limit(5),

    // Approved estimates count
    supabase.from("estimates")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved","partially_approved"]),

    // Unpaid / partial invoices
    supabase.from("helcim_invoices")
      .select(`id, helcim_invoice_number, payment_status, total_cents, amount_due_cents,
        repair_orders (ro_number)`)
      .in("payment_status", ["unpaid","partial"])
      .not("status", "in", "(voided,cancelled,archived)")
      .order("created_at", { ascending: false })
      .limit(5),

    // Helcim invoices with sync errors
    supabase.from("helcim_invoices")
      .select(`id, helcim_invoice_number, sync_error,
        repair_orders (ro_number)`)
      .not("sync_error", "is", null)
      .limit(3),

    // Recent activity log (last 10 entries)
    supabase.from("activity_logs")
      .select("id, action, entity_type, created_at, details")
      .order("created_at", { ascending: false })
      .limit(10),

    // All non-cancelled RO statuses (for pipeline)
    supabase.from("repair_orders")
      .select("status")
      .not("status", "eq", "cancelled"),
  ]);

  // Build pipeline counts from all RO statuses
  const pipelineCounts = {};
  for (const row of (allROStatusesRes.data ?? [])) {
    pipelineCounts[row.status] = (pipelineCounts[row.status] ?? 0) + 1;
  }

  return {
    pendingApptsCount:        pendingAppts.count ?? 0,
    activeROs:                activeROsRes.data  ?? [],
    activeROsCount:           activeROsRes.data?.length ?? 0,
    overdueROs:               overdueROsRes.data ?? [],
    inProgressInspectionsCount: inspectionsRes.count ?? 0,
    sentEstimates:            sentEstimatesRes.data    ?? [],
    sentEstimatesCount:       sentEstimatesRes.data?.length ?? 0,
    approvedEstimatesCount:   approvedEstimatesRes.count ?? 0,
    unpaidInvoices:           unpaidInvoicesRes.data   ?? [],
    unpaidInvoicesCount:      unpaidInvoicesRes.data?.length ?? 0,
    syncErrors:               syncErrorsRes.data       ?? [],
    recentActivity:           recentActivityRes.data   ?? [],
    pipelineCounts,
  };
}
