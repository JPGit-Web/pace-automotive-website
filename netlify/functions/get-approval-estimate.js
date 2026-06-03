// netlify/functions/get-approval-estimate.js
// Public endpoint — no staff auth required.
// Validates a customer approval token and returns sanitized estimate data.
// Token hash is stored; raw token is never stored.

import { createHash } from "crypto";

function sbUrl()     { return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; }
function sbSrk()     { return process.env.SUPABASE_SERVICE_ROLE_KEY; }
function sbHeaders() {
  const key = sbSrk();
  const isJwt = key?.startsWith("eyJ");
  const h = { "apikey": key, "Content-Type": "application/json" };
  if (isJwt) h["Authorization"] = `Bearer ${key}`;
  return h;
}

async function sbGet(table, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`DB fetch error ${table}: ${res.status}`);
  return res.json();
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) }; }

  const { token } = body;
  if (!token?.trim())
    return { statusCode: 400, body: JSON.stringify({ message: "Token required" }) };

  if (!sbUrl() || !sbSrk()) {
    console.error("[get-approval-estimate] Missing Supabase server env vars");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error" }) };
  }

  try {
    /* Hash the raw token to look up stored hash */
    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");

    /* Fetch approval token record */
    const tokens = await sbGet("approval_tokens", {
      token_hash: `eq.${tokenHash}`,
      select: "id,estimate_id,repair_order_id,expires_at,used_at,revoked_at",
    });

    const tokenRow = tokens[0];

    if (!tokenRow)
      return { statusCode: 404, body: JSON.stringify({ valid: false, reason: "not_found" }) };
    if (tokenRow.revoked_at)
      return { statusCode: 410, body: JSON.stringify({ valid: false, reason: "revoked" }) };
    if (new Date(tokenRow.expires_at) < new Date())
      return { statusCode: 410, body: JSON.stringify({ valid: false, reason: "expired" }) };

    const alreadyUsed = !!tokenRow.used_at;

    /* Fetch estimate */
    const estimates = await sbGet("estimates", {
      id:     `eq.${tokenRow.estimate_id}`,
      select: "id,estimate_number,status,title,customer_message,subtotal_cents,tax_cents,total_cents,approved_total_cents,repair_order_id",
    });
    const estimate = estimates[0];
    if (!estimate)
      return { statusCode: 404, body: JSON.stringify({ valid: false, reason: "estimate_not_found" }) };

    /* Fetch customer-visible active items */
    const items = await sbGet("estimate_items", {
      estimate_id:         `eq.${tokenRow.estimate_id}`,
      is_active:           "eq.true",
      is_customer_visible: "eq.true",
      select:              "id,item_type,description,quantity,unit_price_cents,line_total_cents,is_required,approval_status",
    });

    /* Fetch RO + vehicle (separate, no ambiguous join) */
    let ro = null, vehicle = null;
    if (estimate.repair_order_id) {
      const ros = await sbGet("repair_orders", {
        id:     `eq.${estimate.repair_order_id}`,
        select: "ro_number,vehicle_id",
      });
      ro = ros[0];
      if (ro?.vehicle_id) {
        const veh = await sbGet("vehicles", {
          id:     `eq.${ro.vehicle_id}`,
          select: "year,make,model",
        });
        vehicle = veh[0];
      }
    }

    /* Return only customer-safe data — no internal notes, no token_hash */
    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        alreadyUsed,
        estimate: {
          id:               estimate.id,
          estimate_number:  estimate.estimate_number,
          status:           estimate.status,
          title:            estimate.title,
          customer_message: estimate.customer_message,
          subtotal_cents:   estimate.subtotal_cents,
          tax_cents:        estimate.tax_cents,
          total_cents:      estimate.total_cents,
          approved_total_cents: estimate.approved_total_cents,
        },
        ro_number: ro?.ro_number ?? null,
        vehicle:   vehicle ? { year: vehicle.year, make: vehicle.make, model: vehicle.model } : null,
        items: (items ?? []).map((i) => ({
          id:               i.id,
          item_type:        i.item_type,
          description:      i.description,
          quantity:         i.quantity,
          unit_price_cents: i.unit_price_cents,
          line_total_cents: i.line_total_cents,
          is_required:      i.is_required,
          approval_status:  i.approval_status,
        })),
      }),
    };
  } catch (err) {
    console.error("[get-approval-estimate] Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ valid: false, reason: "server_error" }) };
  }
};
