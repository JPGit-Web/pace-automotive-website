// netlify/functions/helcim-create-invoice.js
// Staff-only: creates a Helcim invoice from an existing local invoice record
// or an approved estimate, then saves the Helcim response back to the database.
//
// SECURITY:
//   - HELCIM_API_TOKEN is used only here, never in src/.
//   - SUPABASE_SERVICE_ROLE_KEY is used only here, never in src/.
//   - Staff identity is verified before any action.
//   - No card data is transmitted or stored.
//   - Never log HELCIM_API_TOKEN or SUPABASE_SERVICE_ROLE_KEY.

/* ── Supabase REST helpers (same pattern as other Netlify Functions) ── */
function sbUrl() { return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; }
function sbSrk() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }

function sbHeaders() {
  const key = sbSrk();
  const isJwt = key?.startsWith("eyJ");
  const h = { "apikey": key, "Content-Type": "application/json", "Prefer": "return=representation" };
  if (isJwt) h["Authorization"] = `Bearer ${key}`;
  return h;
}

async function sbGet(table, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`DB fetch ${table}: ${res.status}`);
  return res.json();
}

async function sbPatch(table, where, body) {
  const qs = new URLSearchParams(where).toString();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, {
    method: "PATCH", headers: sbHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DB patch ${table}: ${res.status} ${detail}`);
  }
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DB insert ${table}: ${res.status} ${detail}`);
  }
  return res.json();
}

/* ── Staff token verification ── */
async function verifyStaff(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const res = await fetch(`${sbUrl()}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": sbSrk() },
  });
  if (!res.ok) return null;
  return res.json();
}

/* ── Helcim API call ── */
function helcimToken() { return process.env.HELCIM_API_TOKEN; }
function helcimBase()  {
  const base = process.env.HELCIM_API_BASE_URL || "https://api.helcim.com";
  return base.replace(/\/$/, ""); // strip trailing slash
}

function helcimHeaders() {
  return {
    "api-token":    helcimToken(),
    "accept":       "application/json",
    "content-type": "application/json",
  };
}

/**
 * Build the Helcim invoice creation payload.
 * Isolated here so payload shape is easy to adjust to Helcim API changes.
 *
 * Helcim API reference (v2):
 *   POST /v2/invoices/
 *   Required: currency, lineItems[]
 *   Optional: type, status, notes, customer{}
 *
 * Line item fields:
 *   required: description, quantity, price (in dollars, NOT cents)
 *   optional: taxAmount, discountAmount, sku
 *
 * IMPORTANT — discount and tax are LINE-ITEM-LEVEL fields, NOT invoice-level.
 * Sending discountAmount / taxAmount at the top invoice level has no effect.
 * They must be on individual lineItem objects.
 *
 * DISCOUNT handling:
 *   P.A.C.E. stores discount items (item_type === "discount") as positive
 *   unit_price_cents that are subtracted from the subtotal. We do NOT send
 *   discount items as positive charge lines — that inflates Helcim's subtotal.
 *   Instead, we sum all discount line_total_cents into one dollar amount and
 *   apply it as `discountAmount` on the LAST charge line item.
 *   Helcim line math: net = (price × quantity) − discountAmount + taxAmount
 *
 * TAX handling:
 *   We apply the full invoice tax_cents as `taxAmount` on the LAST charge line
 *   item. This ensures Helcim's invoice total matches P.A.C.E.'s total exactly.
 *
 * If there is only one charge line item, both discount and tax go on that item.
 * If there are no charge line items, we cannot create the invoice.
 *
 * type:   "INVOICE"
 * status: "DUE"
 *
 * Returns: { payload, lineSubtotalDollars, lineDiscountTotal, lineTaxTotal, expectedTotalDollars }
 * for preflight verification.
 */
function buildHelcimPayload({ invoice, invoiceItems, ro, customer, vehicle, customerId = null }) {
  const safe      = (s = "") => String(s).replace(/[\r\n<>]/g, " ").trim().slice(0, 500);
  const toDollars = (cents)  => parseFloat(((cents ?? 0) / 100).toFixed(2));

  // Separate charge items from discount items
  const chargeItems  = (invoiceItems ?? []).filter((i) => i.item_type !== "discount");
  const discountItems = (invoiceItems ?? []).filter((i) => i.item_type === "discount");

  // Sum total discount (dollars)
  const discountCents   = discountItems.reduce((sum, i) => sum + (i.line_total_cents ?? 0), 0);
  const discountDollars = toDollars(discountCents);

  // GST/tax from local invoice (dollars)
  const taxDollars = toDollars(invoice.tax_cents);

  // Build charge line items; apply discount + tax to the LAST item
  const lineItems = chargeItems.map((item, idx) => {
    const isLast = idx === chargeItems.length - 1;
    const li = {
      description: safe(item.description),
      quantity:    parseFloat(item.quantity) || 1,
      price:       toDollars(item.unit_price_cents),
    };
    if (isLast && discountDollars > 0) li.discountAmount = discountDollars;
    if (isLast && taxDollars      > 0) li.taxAmount      = taxDollars;
    return li;
  });

  // Preflight math — mirrors exactly what Helcim will calculate per line:
  // net(line) = (price × quantity) − discountAmount + taxAmount
  const lineSubtotalDollars = lineItems.reduce(
    (sum, li) => sum + (li.price * li.quantity),
    0
  );
  const lineDiscountTotal = lineItems.reduce((sum, li) => sum + (li.discountAmount ?? 0), 0);
  const lineTaxTotal      = lineItems.reduce((sum, li) => sum + (li.taxAmount      ?? 0), 0);
  const expectedTotalDollars = parseFloat(
    (lineSubtotalDollars - lineDiscountTotal + lineTaxTotal).toFixed(2)
  );

  // Notes: RO + vehicle only — no internal notes
  const notesParts = [];
  if (ro?.ro_number) notesParts.push(`Repair Order: ${safe(ro.ro_number)}`);
  if (vehicle) {
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    if (vehicleStr) notesParts.push(`Vehicle: ${safe(vehicleStr)}`);
  }
  if (invoice.notes) notesParts.push(safe(invoice.notes));
  const notes = notesParts.join(" | ").slice(0, 1000) || undefined;

  const payload = {
    type:      "INVOICE",
    status:    "DUE",
    currency:  (invoice.currency || "CAD").toUpperCase(),
    lineItems,
  };

  if (notes) payload.notes = notes;

  // Customer attachment — Helcim requires customerId as a top-level INTEGER field
  // on the invoice payload. Nesting it only inside customer{} is not sufficient.
  // customerCode is NOT used for attachment — only customerId (numeric) works.
  if (customerId) {
    const invoiceCustomerId = Number(customerId);
    if (!isNaN(invoiceCustomerId)) {
      payload.customerId = invoiceCustomerId;
    }
  }

  // Also include a customer sub-object with display fields (contactName, email, phone)
  // so Helcim can show the customer details on the invoice, even if the link is by customerId above.
  const customerPayload = {};
  if (customer?.first_name || customer?.last_name) {
    const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    if (contactName) customerPayload.contactName = contactName;
  }
  if (customer?.email) customerPayload.email = safe(customer.email);
  if (customer?.phone) customerPayload.phone = safe(customer.phone);
  if (Object.keys(customerPayload).length > 0) payload.customer = customerPayload;

  return { payload, lineSubtotalDollars, lineDiscountTotal, lineTaxTotal, expectedTotalDollars };
}

/**
 * Find an existing Helcim customer or create a new one.
 * Returns { customerId, customerCode, source } where source indicates how we found them.
 *
 * Lookup order (to prevent duplicate customers):
 *   1. local_reuse  — another helcim_invoices row for the same P.A.C.E. customer already
 *                     has a stored helcim_customer_id. Reuse it directly.
 *   2. helcim_email — search Helcim GET /v2/customers/?email={email} for an exact match.
 *   3. helcim_name  — search Helcim GET /v2/customers/?contactName={name} for an exact match.
 *   4. created      — no match found; call POST /v2/customers/ to create a new one.
 *   5. failed       — all attempts failed; invoice creates without a customer link.
 *
 * Helcim API: GET /v2/customers/  (returns paginated array of customers)
 *             POST /v2/customers/ (creates a new customer)
 */
async function findOrCreateHelcimCustomer(customer, paceCustomerId) {
  const EMPTY = { customerId: null, customerCode: null, source: "failed" };
  if (!customer) return EMPTY;

  const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();

  /* ── Step 1: Check other helcim_invoices rows for the same P.A.C.E. customer ── */
  if (paceCustomerId) {
    try {
      // Find repair order IDs belonging to this P.A.C.E. customer
      const roRows = await sbGet("repair_orders", {
        customer_id: `eq.${paceCustomerId}`,
        select:      "id",
      });
      const roIds = (roRows ?? []).map((r) => r.id).filter(Boolean);

      if (roIds.length) {
        const existingInvoices = await sbGet("helcim_invoices", {
          "repair_order_id": `in.(${roIds.join(",")})`,
          "helcim_customer_id": "not.is.null",
          select: "helcim_customer_id",
          limit:  "1",
          order:  "created_at.desc",
        });
        const existing = existingInvoices?.[0]?.helcim_customer_id;
        if (existing) {
          console.log("[helcim-create-invoice] Reusing local Helcim customer ID:", existing);
          return { customerId: String(existing), customerCode: null, source: "local_reuse" };
        }
      }
    } catch (e) {
      console.warn("[helcim-create-invoice] Local customer lookup failed (non-fatal):", e.message);
    }
  }

  /* ── Step 2: Search Helcim by email ── */
  if (customer.email) {
    try {
      const qs = new URLSearchParams({ email: customer.email }).toString();
      const res = await fetch(`${helcimBase()}/v2/customers/?${qs}`, { headers: helcimHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.customers ?? data.data ?? []);
        const match = list[0]; // first match by email is the best candidate
        if (match) {
          const customerId   = match.customerId   ?? match.customer_id   ?? match.id   ?? null;
          const customerCode = match.customerCode ?? match.customer_code ?? null;
          if (customerId) {
            console.log("[helcim-create-invoice] Found Helcim customer by email:", { customerId, customerCode });
            return { customerId: String(customerId), customerCode: customerCode ? String(customerCode) : null, source: "helcim_email" };
          }
        }
      }
    } catch (e) {
      console.warn("[helcim-create-invoice] Helcim email search failed (non-fatal):", e.message);
    }
  }

  /* ── Step 3: Search Helcim by contactName ── */
  if (contactName) {
    try {
      const qs = new URLSearchParams({ contactName }).toString();
      const res = await fetch(`${helcimBase()}/v2/customers/?${qs}`, { headers: helcimHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.customers ?? data.data ?? []);
        // Exact name match only to avoid false positives
        const match = list.find((c) =>
          (c.contactName ?? "").trim().toLowerCase() === contactName.toLowerCase()
        );
        if (match) {
          const customerId   = match.customerId   ?? match.customer_id   ?? match.id   ?? null;
          const customerCode = match.customerCode ?? match.customer_code ?? null;
          if (customerId) {
            console.log("[helcim-create-invoice] Found Helcim customer by name:", { customerId, customerCode });
            return { customerId: String(customerId), customerCode: customerCode ? String(customerCode) : null, source: "helcim_name" };
          }
        }
      }
    } catch (e) {
      console.warn("[helcim-create-invoice] Helcim name search failed (non-fatal):", e.message);
    }
  }

  /* ── Step 4: Create new Helcim customer ── */
  if (!contactName) {
    console.warn("[helcim-create-invoice] Cannot create customer: no name available");
    return EMPTY;
  }

  try {
    const payload = { contactName };
    if (customer.email) payload.email = customer.email;
    if (customer.phone) payload.phone = customer.phone;

    if (process.env.NODE_ENV !== "production") {
      console.log("[helcim-create-invoice] Creating new Helcim customer:", { contactName, hasEmail: !!customer.email });
    }

    const res = await fetch(`${helcimBase()}/v2/customers/`, {
      method:  "POST",
      headers: helcimHeaders(),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[helcim-create-invoice] Customer create ${res.status}:`, detail.slice(0, 300));
      return EMPTY;
    }

    const data = await res.json();
    const customerId   = data.customerId   ?? data.customer_id   ?? data.id   ?? null;
    const customerCode = data.customerCode ?? data.customer_code ?? null;

    if (process.env.NODE_ENV !== "production") {
      console.log("[helcim-create-invoice] Helcim customer created:", { customerId, customerCode });
    }

    return {
      customerId:   customerId   ? String(customerId)   : null,
      customerCode: customerCode ? String(customerCode) : null,
      source: "created",
    };
  } catch (err) {
    console.warn("[helcim-create-invoice] Customer create threw:", err.message);
    return EMPTY;
  }
}

/* ── Activity log (non-fatal) ── */
async function logActivity(action, entityType, entityId, details = null) {
  try {
    await sbPost("activity_logs", {
      action,
      entity_type: entityType,
      entity_id:   entityId,
      details:     details ? JSON.stringify(details) : null,
    });
  } catch { /* non-fatal */ }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) }; }

  const { invoiceId, estimateId } = body;
  if (!invoiceId && !estimateId)
    return { statusCode: 400, body: JSON.stringify({ message: "invoiceId or estimateId required" }) };

  /* 1. Verify staff */
  const staff = await verifyStaff(event.headers?.authorization || event.headers?.Authorization);
  if (!staff?.id)
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };

  /* 2. Check env vars */
  if (!sbUrl() || !sbSrk()) {
    console.error("[helcim-create-invoice] Missing Supabase server env vars");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error" }) };
  }
  if (!helcimToken()) {
    console.error("[helcim-create-invoice] HELCIM_API_TOKEN not set");
    return { statusCode: 500, body: JSON.stringify({ message: "Helcim API is not configured. Add HELCIM_API_TOKEN to Netlify environment variables." }) };
  }

  try {
    /* 3. Resolve the local invoice record */
    let localInvoice;

    if (invoiceId) {
      /* ── Flow A: invoice record already exists ── */
      const invRows = await sbGet("helcim_invoices", { id: `eq.${invoiceId}`, select: "*" });
      localInvoice = invRows[0];
      if (!localInvoice)
        return { statusCode: 404, body: JSON.stringify({ message: "Invoice not found" }) };
      if (localInvoice.helcim_invoice_id)
        return { statusCode: 409, body: JSON.stringify({ message: `Invoice already linked to Helcim ID: ${localInvoice.helcim_invoice_id}` }) };
      if ((localInvoice.total_cents ?? 0) === 0)
        return { statusCode: 400, body: JSON.stringify({ message: "Invoice total must be greater than zero" }) };
      if (!localInvoice.repair_order_id)
        return { statusCode: 400, body: JSON.stringify({ message: "Invoice must be linked to a repair order" }) };

    } else {
      /* ── Flow B: create local invoice from estimate, then create in Helcim ── */
      const estRows = await sbGet("estimates", { id: `eq.${estimateId}`, select: "*" });
      const estimate = estRows[0];
      if (!estimate)
        return { statusCode: 404, body: JSON.stringify({ message: "Estimate not found" }) };
      if (!["approved","partially_approved"].includes(estimate.status))
        return { statusCode: 400, body: JSON.stringify({ message: "Estimate must be approved before creating a Helcim invoice" }) };
      if (!estimate.repair_order_id)
        return { statusCode: 400, body: JSON.stringify({ message: "Estimate must be linked to a repair order" }) };

      // Check if invoice already exists for this estimate
      const existing = await sbGet("helcim_invoices", {
        estimate_id: `eq.${estimateId}`,
        select: "id,helcim_invoice_id,total_cents",
        order: "created_at.desc",
        limit: "1",
      });
      if (existing[0]?.helcim_invoice_id)
        return { statusCode: 409, body: JSON.stringify({ message: "A Helcim invoice already exists for this estimate" }) };

      const totalCents = estimate.approved_total_cents > 0 ? estimate.approved_total_cents : estimate.total_cents;
      if ((totalCents ?? 0) === 0)
        return { statusCode: 400, body: JSON.stringify({ message: "Estimate total must be greater than zero" }) };

      // Create or reuse local invoice record
      if (existing[0]) {
        localInvoice = existing[0];
      } else {
        const subCents = Math.round(totalCents / 1.05);
        const taxCents = totalCents - subCents;
        const created = await sbPost("helcim_invoices", {
          repair_order_id: estimate.repair_order_id,
          estimate_id:     estimateId,
          status:          "draft",
          payment_status:  "unpaid",
          subtotal_cents:  subCents,
          tax_cents:       taxCents,
          total_cents:     totalCents,
          amount_due_cents: totalCents,
          amount_paid_cents: 0,
          currency:        "CAD",
        });
        localInvoice = Array.isArray(created) ? created[0] : created;

        // Snapshot estimate items
        const estItems = await sbGet("estimate_items", {
          estimate_id:         `eq.${estimateId}`,
          is_active:           "eq.true",
          is_customer_visible: "eq.true",
          select:              "id,description,quantity,unit_price_cents,line_total_cents,item_type,sort_order",
        });
        if (estItems.length) {
          await sbPost("helcim_invoice_items", estItems.map((i, idx) => ({
            helcim_invoice_id: localInvoice.id,
            estimate_item_id:  i.id,
            description:       i.description,
            quantity:          i.quantity,
            unit_price_cents:  i.unit_price_cents,
            line_total_cents:  i.line_total_cents,
            item_type:         i.item_type,
            sort_order:        i.sort_order ?? idx,
          }))).catch((e) => console.warn("[helcim-create-invoice] item snapshot:", e.message));
        }
      }
    }

    /* 4. Fetch context: RO, customer, vehicle, items */
    const roRows = await sbGet("repair_orders", {
      id:     `eq.${localInvoice.repair_order_id}`,
      select: "id,ro_number,customer_id,vehicle_id",
    });
    const ro = roRows[0];

    let customer = null, vehicle = null;
    if (ro?.customer_id) {
      const c = await sbGet("customers", { id: `eq.${ro.customer_id}`, select: "id,first_name,last_name,email,phone" });
      customer = c[0] ?? null;
    }
    if (ro?.vehicle_id) {
      const v = await sbGet("vehicles", { id: `eq.${ro.vehicle_id}`, select: "id,year,make,model" });
      vehicle = v[0] ?? null;
    }

    const invoiceItems = await sbGet("helcim_invoice_items", {
      helcim_invoice_id: `eq.${localInvoice.id}`,
      select:            "description,quantity,unit_price_cents,line_total_cents,item_type",
    });

    if (!invoiceItems.length) {
      return { statusCode: 400, body: JSON.stringify({ message: "Invoice has no line items. Add items before creating in Helcim." }) };
    }

    /* 5. Create/find Helcim customer (non-fatal) and build payload */
    // Helcim links invoices to customers via numeric customerId.
    // We use the already-stored value if available, otherwise create the customer now.
    let helcimCustomerId   = localInvoice.helcim_customer_id ?? null;
    let helcimCustomerCode = null;
    let customerLinkWarning = null;

    if (!helcimCustomerId && customer) {
      // Pass ro.customer_id so findOrCreateHelcimCustomer can check other local invoices first
      const result = await findOrCreateHelcimCustomer(customer, ro?.customer_id ?? null);
      helcimCustomerId   = result.customerId;
      helcimCustomerCode = result.customerCode;

      if (helcimCustomerId) {
        // Persist so future invoices for this RO reuse the same Helcim customer
        await sbPatch("helcim_invoices", { id: `eq.${localInvoice.id}` }, {
          helcim_customer_id: helcimCustomerId,
        }).catch((e) => console.warn("[helcim-create-invoice] Customer ID save:", e.message));
      } else {
        customerLinkWarning = "Helcim invoice created, but customer link failed: could not find or create Helcim customer";
      }
    } else if (!helcimCustomerId && !customer) {
      customerLinkWarning = "Helcim invoice created, but no customer was linked to the repair order";
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[helcim-create-invoice] Customer linking:", {
        hasCustomer:     !!customer,
        customerId:      helcimCustomerId ?? "(none — invoice will have no customer)",
        customerCode:    helcimCustomerCode ?? null,
        contactName:     customer ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : null,
        hasEmail:        !!customer?.email,
      });
    }

    const { payload: helcimPayload, lineSubtotalDollars, lineDiscountTotal, lineTaxTotal, expectedTotalDollars } =
      buildHelcimPayload({ invoice: localInvoice, invoiceItems, ro, customer, vehicle, customerId: helcimCustomerId });

    /* 5a. Preflight total check — abort if Helcim-calculated total won't match local invoice */
    const localTotalDollars = parseFloat(((localInvoice.total_cents ?? 0) / 100).toFixed(2));
    const totalMismatch = Math.abs(expectedTotalDollars - localTotalDollars) > 0.02; // 2¢ tolerance

    if (process.env.NODE_ENV !== "production") {
      console.log("[helcim-create-invoice] Preflight totals:", {
        lineSubtotal:     lineSubtotalDollars,
        lineDiscountTotal,
        lineTaxTotal,
        expectedTotal:    expectedTotalDollars,
        localTotal:       localTotalDollars,
        mismatch:         totalMismatch,
      });
    }

    if (totalMismatch) {
      const msg = `Payload total mismatch: expected $${expectedTotalDollars} but local invoice shows $${localTotalDollars}. Recalculate the invoice and try again.`;
      console.error("[helcim-create-invoice]", msg);
      await sbPatch("helcim_invoices", { id: `eq.${localInvoice.id}` }, {
        sync_error:     msg,
        last_synced_at: new Date().toISOString(),
      }).catch(() => {});
      return { statusCode: 400, body: JSON.stringify({ message: msg }) };
    }

    const helcimEndpoint = `${helcimBase()}/v2/invoices/`;
    console.log(`[helcim-create-invoice] Calling Helcim API: POST ${helcimEndpoint}`);

    if (process.env.NODE_ENV !== "production") {
      console.log("[helcim-create-invoice] Payload shape (redacted):", {
        type:           helcimPayload.type,
        status:         helcimPayload.status,
        currency:       helcimPayload.currency,
        customerId:     helcimPayload.customerId ?? "(none)",
        hasCustomer:    !!helcimPayload.customer,
        contactName:    helcimPayload.customer?.contactName ?? null,
        hasEmail:       !!helcimPayload.customer?.email,
        lineItemCount:  helcimPayload.lineItems?.length ?? 0,
        hasDiscount:    helcimPayload.lineItems?.some((li) => li.discountAmount > 0),
        hasTax:         helcimPayload.lineItems?.some((li) => li.taxAmount > 0),
        expectedTotal:  expectedTotalDollars,
      });
    }

    const helcimRes = await fetch(helcimEndpoint, {
      method:  "POST",
      headers: helcimHeaders(),
      body:    JSON.stringify(helcimPayload),
    });

    if (!helcimRes.ok) {
      let errDetail = "(unreadable)";
      try {
        const errJson = await helcimRes.json();
        errDetail = errJson?.errors ? JSON.stringify(errJson.errors) : JSON.stringify(errJson);
      } catch {
        errDetail = await helcimRes.text().catch(() => "(unreadable)");
      }
      console.error(`[helcim-create-invoice] Helcim API error ${helcimRes.status}:`, errDetail);

      // Log sync failure
      await logActivity("invoice.helcim_sync_failed", "helcim_invoice", localInvoice.id, {
        status: helcimRes.status,
      });

      // Persist sync error to invoice record
      await sbPatch("helcim_invoices", { id: `eq.${localInvoice.id}` }, {
        sync_error:     `Helcim API error ${helcimRes.status}`,
        last_synced_at: new Date().toISOString(),
      }).catch(() => {});

      return {
        statusCode: helcimRes.status >= 500 ? 502 : 400,
        body: JSON.stringify({ message: `Helcim API returned an error (${helcimRes.status}). Check your Helcim API token and account settings.` }),
      };
    }

    /* 6. Parse Helcim response */
    let helcimData;
    try { helcimData = await helcimRes.json(); }
    catch { helcimData = {}; }

    console.log("[helcim-create-invoice] Helcim API success:", helcimRes.status);

    // Extract safe fields from response
    // Field names depend on Helcim API version — adjust comments if names differ
    const helcimInvoiceId     = helcimData.invoiceNumber     // v2 returns invoiceNumber as the unique ID
                             ?? helcimData.id
                             ?? helcimData.invoice_id
                             ?? null;
    const helcimInvoiceNumber = helcimData.invoiceNumber
                             ?? helcimData.invoice_number
                             ?? null;
    // returnedCustomerId — from the Helcim invoice creation response (distinct from
    // helcimCustomerId declared above, which came from our pre-flight customer creation)
    const returnedCustomerId  = helcimData.customer?.customerId
                             ?? helcimData.customer?.customerCode
                             ?? helcimData.customerId
                             ?? null;
    const helcimPaymentLink   = helcimData.checkoutUrl       // Helcim hosted payment page
                             ?? helcimData.paymentUrl
                             ?? helcimData.hostedUrl
                             ?? null;

    /* 7. Update local helcim_invoices record with Helcim references */
    const now = new Date().toISOString();
    const updatePatch = {
      status:                "created",
      payment_status:        localInvoice.payment_status === "unpaid" ? "unpaid" : localInvoice.payment_status,
      last_synced_at:        now,
      sync_error:            null,
    };
    if (helcimInvoiceId)     updatePatch.helcim_invoice_id     = String(helcimInvoiceId);
    if (helcimInvoiceNumber) updatePatch.helcim_invoice_number = String(helcimInvoiceNumber);
    // Prefer customer ID from invoice response; fall back to the one created earlier
    const finalCustomerId = returnedCustomerId ?? helcimCustomerId ?? helcimCustomerCode ?? null;
    if (finalCustomerId) updatePatch.helcim_customer_id = String(finalCustomerId);

    // If customer linking failed earlier, persist the warning (non-blocking)
    if (customerLinkWarning && !finalCustomerId) {
      updatePatch.sync_error = customerLinkWarning;
    }
    if (helcimPaymentLink)   updatePatch.helcim_payment_link   = String(helcimPaymentLink);
    if (!localInvoice.issued_at) updatePatch.issued_at = now;

    await sbPatch("helcim_invoices", { id: `eq.${localInvoice.id}` }, updatePatch);

    /* 8. Sync Helcim references to repair_orders record */
    if (ro?.id) {
      const roPatch = {};
      if (helcimInvoiceId   && !ro.helcim_invoice_id)   roPatch.helcim_invoice_id   = String(helcimInvoiceId);
      if (helcimPaymentLink && !ro.helcim_payment_link) roPatch.helcim_payment_link = String(helcimPaymentLink);
      if (Object.keys(roPatch).length > 0) {
        await sbPatch("repair_orders", { id: `eq.${ro.id}` }, roPatch)
          .catch((e) => console.warn("[helcim-create-invoice] RO sync:", e.message));
      }
    }

    /* 9. Activity log */
    await logActivity("invoice.helcim_created", "helcim_invoice", localInvoice.id, {
      helcim_invoice_id:     helcimInvoiceId,
      helcim_invoice_number: helcimInvoiceNumber,
      has_payment_link:      !!helcimPaymentLink,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Helcim invoice created successfully.",
        invoiceId:             localInvoice.id,
        helcim_invoice_id:     helcimInvoiceId,
        helcim_invoice_number: helcimInvoiceNumber,
        helcim_payment_link:   helcimPaymentLink,
      }),
    };

  } catch (err) {
    console.error("[helcim-create-invoice] Unexpected error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to create Helcim invoice. Please try again or check server logs." }),
    };
  }
};
