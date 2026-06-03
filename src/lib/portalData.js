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
// ACTIVITY LOGS
// ─────────────────────────────────────────────────────────────

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
