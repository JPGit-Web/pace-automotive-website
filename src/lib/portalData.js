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
      .select("id, year, make, model, license_plate, plate_province, color")
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
    // Normalize empty strings → null; keep numbers/dates as-is
    if (typeof val === "string" && val.trim() === "") {
      fields[col] = null;
    } else {
      fields[col] = val ?? null;
    }
  }

  // Set created_by from current session
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) fields.created_by = session.user.id;
  } catch { /* non-fatal */ }

  const { data, error } = await supabase
    .from("repair_orders")
    .insert([fields])
    .select(`
      id, ro_number, status, payment_status, promised_date, created_at,
      customers (id, first_name, last_name),
      vehicles  (id, year, make, model, license_plate)
    `)
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
// ACTIVITY LOGS
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// APPOINTMENT REQUESTS
// ─────────────────────────────────────────────────────────────

const APPT_COLUMNS = [
  "source", "name", "phone", "email",
  "vehicle_info", "service_requested", "preferred_date", "notes",
  "status", "customer_id", "vehicle_id", "repair_order_id",
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

/** Change only the status field on an appointment request. */
export async function updateAppointmentRequestStatus(id, status) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error("[updateAppointmentRequestStatus] Supabase error:", error);
    throw error;
  }
  return data;
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
