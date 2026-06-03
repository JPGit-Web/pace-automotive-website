// netlify/functions/submit-estimate-approval.js
// Public endpoint — no staff auth required.
// Processes the customer's approve/decline decisions for estimate items.

import { createHash } from "crypto";

const RESEND_API_URL = "https://api.resend.com/emails";
const GST_RATE = 0.05;

function sbUrl()     { return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; }
function sbSrk()     { return process.env.SUPABASE_SERVICE_ROLE_KEY; }
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
  if (!res.ok) throw new Error(`DB fetch error ${table}: ${res.status}`);
  return res.json();
}

async function sbPatch(table, where, body) {
  const qs = new URLSearchParams(where).toString();
  const res = await fetch(`${sbUrl()}/rest/v1/${table}?${qs}`, {
    method: "PATCH", headers: sbHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DB patch error ${table}: ${res.status}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders(), body: JSON.stringify(body),
  });
  return res.json(); // non-fatal log inserts
}

function safe(s = "") { return String(s).replace(/[\r\n<>]/g, " ").trim().slice(0, 500); }
function fmtCents(c)  { return "$" + ((c ?? 0) / 100).toFixed(2); }

export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) }; }

  const { token, itemDecisions } = body;
  if (!token?.trim())
    return { statusCode: 400, body: JSON.stringify({ message: "Token required" }) };
  if (!Array.isArray(itemDecisions) || itemDecisions.length === 0)
    return { statusCode: 400, body: JSON.stringify({ message: "Item decisions required" }) };

  // Validate decision values
  const VALID_DECISIONS = new Set(["approved", "declined"]);
  for (const d of itemDecisions) {
    if (!d.itemId || !VALID_DECISIONS.has(d.decision))
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid item decision format" }) };
  }

  if (!sbUrl() || !sbSrk()) {
    console.error("[submit-estimate-approval] Missing Supabase server env vars");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error" }) };
  }

  try {
    /* 1. Hash token and validate */
    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
    const tokens = await sbGet("approval_tokens", {
      token_hash: `eq.${tokenHash}`,
      select: "id,estimate_id,repair_order_id,expires_at,used_at,revoked_at",
    });
    const tokenRow = tokens[0];

    if (!tokenRow)
      return { statusCode: 404, body: JSON.stringify({ message: "Approval link not found." }) };
    if (tokenRow.revoked_at)
      return { statusCode: 410, body: JSON.stringify({ message: "This approval link has been revoked. Please contact P.A.C.E." }) };
    if (new Date(tokenRow.expires_at) < new Date())
      return { statusCode: 410, body: JSON.stringify({ message: "This approval link has expired. Please contact P.A.C.E." }) };
    if (tokenRow.used_at)
      return { statusCode: 409, body: JSON.stringify({ message: "This approval has already been submitted. Please contact P.A.C.E. if you need to make changes." }) };

    /* 2. Fetch customer-visible active items for this estimate */
    const estimateItems = await sbGet("estimate_items", {
      estimate_id:         `eq.${tokenRow.estimate_id}`,
      is_active:           "eq.true",
      is_customer_visible: "eq.true",
      select:              "id,item_type,description,line_total_cents,is_required,approval_status",
    });

    /* 3. Build decision map */
    const decisionMap = new Map(itemDecisions.map((d) => [d.itemId, d.decision]));
    const allowedItemIds = new Set(estimateItems.map((i) => i.id));

    /* 4. Validate: only items from this estimate, required items must be approved */
    for (const d of itemDecisions) {
      if (!allowedItemIds.has(d.itemId))
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid item in decisions" }) };
    }
    for (const item of estimateItems) {
      if (item.is_required && decisionMap.get(item.id) === "declined")
        return { statusCode: 400, body: JSON.stringify({ message: `"${safe(item.description)}" is required and cannot be declined.` }) };
    }

    /* 5. Apply decisions — update each item */
    for (const item of estimateItems) {
      const decision = item.is_required ? "approved" : (decisionMap.get(item.id) ?? "pending");
      if (decision !== item.approval_status) {
        await sbPatch("estimate_items", { id: `eq.${item.id}` }, { approval_status: decision });
      }
    }

    /* 6. Calculate approved total */
    let approvedSubtotal = 0;
    for (const item of estimateItems) {
      const decision = item.is_required ? "approved" : (decisionMap.get(item.id) ?? "pending");
      if (decision === "approved") {
        approvedSubtotal += item.item_type === "discount"
          ? -(item.line_total_cents ?? 0)
          :  (item.line_total_cents ?? 0);
      }
    }
    approvedSubtotal = Math.max(0, approvedSubtotal);
    const approvedTax   = Math.round(approvedSubtotal * GST_RATE);
    const approvedTotal = approvedSubtotal + approvedTax;

    /* 7. Determine estimate status */
    const optionalItems = estimateItems.filter((i) => !i.is_required);
    const approvedOptional = optionalItems.filter((i) => decisionMap.get(i.id) === "approved");
    let newStatus;
    if (optionalItems.length === 0 || approvedOptional.length === optionalItems.length) {
      newStatus = "approved";
    } else if (approvedOptional.length > 0 || estimateItems.some((i) => i.is_required)) {
      newStatus = "partially_approved";
    } else {
      newStatus = "declined";
    }

    const now = new Date().toISOString();
    const estUpdate = {
      status:               newStatus,
      approved_total_cents: approvedTotal,
    };
    if (newStatus === "approved")           estUpdate.approved_at = now;
    if (newStatus === "declined")           estUpdate.declined_at = now;

    await sbPatch("estimates", { id: `eq.${tokenRow.estimate_id}` }, estUpdate);

    /* 8. Mark token used */
    await sbPatch("approval_tokens", { id: `eq.${tokenRow.id}` }, { used_at: now });

    /* 9. Activity log (server-side insert) */
    await sbPost("activity_logs", {
      action:      `estimate.${newStatus === "approved" ? "approved" : newStatus === "declined" ? "declined" : "partially_approved"}`,
      entity_type: "estimate",
      entity_id:   tokenRow.estimate_id,
      details:     JSON.stringify({ approved_total_cents: approvedTotal, status: newStatus }),
    });

    /* 10. Business notification email */
    if (process.env.RESEND_API_KEY && process.env.BUSINESS_EMAIL) {
      const itemSummary = estimateItems.map((i) => {
        const dec = i.is_required ? "approved (required)" : (decisionMap.get(i.id) ?? "no decision");
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${safe(i.description)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-transform:capitalize;">${dec}</td></tr>`;
      }).join("");

      const notificationHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;background:#f4f4f4;">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
  <div style="background:#0b1b3a;color:#f4ecd8;padding:20px 24px;border-bottom:3px solid #b3201d;">
    <h1 style="margin:0;font-size:18px;">Customer Approval Received</h1>
  </div>
  <div style="padding:20px 24px;">
    <p>A customer has responded to estimate approval.</p>
    <p><strong>Status: ${newStatus.replace(/_/g, " ").toUpperCase()}</strong></p>
    <p>Approved Total: <strong>${fmtCents(approvedTotal)}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
      <tr style="background:#f0f2f5;"><th style="padding:6px 10px;text-align:left;">Item</th><th style="padding:6px 10px;text-align:left;">Decision</th></tr>
      ${itemSummary}
    </table>
  </div>
</div></body></html>`;

      await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:    `P.A.C.E. System <${process.env.FROM_EMAIL || "noreply@powerautomotive.ca"}>`,
          to:      [process.env.BUSINESS_EMAIL],
          subject: `[P.A.C.E.] Estimate approval response received — ${newStatus.replace(/_/g, " ")}`,
          html:    notificationHtml,
        }),
      }).catch((e) => console.warn("[submit-estimate-approval] Notification email failed:", e.message));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Thank you — your response has been recorded.",
        status:  newStatus,
        approved_total_cents: approvedTotal,
      }),
    };
  } catch (err) {
    console.error("[submit-estimate-approval] Error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "We could not process your response. Please contact P.A.C.E. directly." }),
    };
  }
};
