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
    .single();

  if (error && error.code === "PGRST116") return null;
  if (error) throw error;
  return data;
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
