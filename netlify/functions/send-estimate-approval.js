// netlify/functions/send-estimate-approval.js
// Staff-only: creates an approval token and emails the customer a secure link.
// Requires a valid staff Supabase access token in Authorization header.
// SUPABASE_SERVICE_ROLE_KEY is server-side only — never in src/.

import { createHash, randomUUID } from "crypto";

const RESEND_API_URL = "https://api.resend.com/emails";

/* ── Supabase REST helpers ── */
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
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DB insert error ${table}: ${res.status} ${detail}`);
  }
  return res.json();
}

/* ── Verify staff access token ── */
async function verifyStaff(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const res = await fetch(`${sbUrl()}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": sbSrk() },
  });
  if (!res.ok) return null;
  return res.json();
}

/* ── Email ── */
async function sendEmail(payload) {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Email error: ${res.status}`);
}

function safe(s = "") { return String(s).replace(/[\r\n<>]/g, " ").trim().slice(0, 500); }
function fmtCents(c)  { return "$" + ((c ?? 0) / 100).toFixed(2); }

/* ════════════════════════════════════════════════════════════ */
export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };

  /* 1. Parse body */
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) }; }

  const { estimateId, customerEmail, message } = body;
  if (!estimateId)
    return { statusCode: 400, body: JSON.stringify({ message: "estimateId required" }) };
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
    return { statusCode: 400, body: JSON.stringify({ message: "Valid customer email required" }) };

  /* 2. Verify staff */
  const staff = await verifyStaff(event.headers?.authorization || event.headers?.Authorization);
  if (!staff?.id)
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };

  const SUPABASE_URL = sbUrl();
  const SUPABASE_SRK = sbSrk();
  if (!SUPABASE_URL || !SUPABASE_SRK) {
    console.error("[send-estimate-approval] Missing Supabase server env vars");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error" }) };
  }

  const FROM_EMAIL  = process.env.FROM_EMAIL  || "noreply@powerautomotive.ca";
  const FROM_NAME   = process.env.FROM_NAME   || "P.A.C.E. Auto Repair";
  const SITE_URL    = process.env.SITE_URL    || (event.headers?.origin ?? "https://powerautomotive.ca");

  try {
    /* 3. Fetch estimate */
    const estimates = await sbGet("estimates", { id: `eq.${estimateId}`, select: "*" });
    const estimate = estimates[0];
    if (!estimate) return { statusCode: 404, body: JSON.stringify({ message: "Estimate not found" }) };
    if (estimate.status === "cancelled")
      return { statusCode: 400, body: JSON.stringify({ message: "Cannot send a cancelled estimate" }) };

    /* 4. Fetch customer-visible active items */
    const items = await sbGet("estimate_items", {
      estimate_id: `eq.${estimateId}`,
      is_active: "eq.true",
      is_customer_visible: "eq.true",
      select: "id, description, item_type, quantity, unit_price_cents, line_total_cents, is_required",
    });
    if (!items?.length)
      return { statusCode: 400, body: JSON.stringify({ message: "Estimate has no visible items to send" }) };

    /* 5. Fetch RO, customer, vehicle (separate calls to avoid join ambiguity) */
    let ro = null, customer = null, vehicle = null;
    if (estimate.repair_order_id) {
      const ros = await sbGet("repair_orders", { id: `eq.${estimate.repair_order_id}`, select: "id,ro_number,customer_id,vehicle_id" });
      ro = ros[0];
      if (ro?.customer_id) {
        const c = await sbGet("customers", { id: `eq.${ro.customer_id}`, select: "id,first_name,last_name" });
        customer = c[0];
      }
      if (ro?.vehicle_id) {
        const v = await sbGet("vehicles", { id: `eq.${ro.vehicle_id}`, select: "id,year,make,model" });
        vehicle = v[0];
      }
    }

    /* 6. Generate raw token + hash (never log raw token) */
    const rawToken  = randomUUID();
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    /* 7. Insert approval token (store hash only) */
    await sbPost("approval_tokens", {
      estimate_id:    estimateId,
      repair_order_id: estimate.repair_order_id,
      token_hash:     tokenHash,
      token_label:    `Sent to ${safe(customerEmail)}`,
      customer_email: safe(customerEmail),
      expires_at:     expiresAt,
    });

    /* 8. Update estimate status */
    await sbPatch("estimates", { id: `eq.${estimateId}` }, {
      status:     "sent",
      sent_at:    new Date().toISOString(),
      expires_at: expiresAt,
    });

    /* 9. Build approval URL (raw token in URL only, not stored) */
    const approvalUrl = `${SITE_URL}/approve/${rawToken}`;

    /* 10. Build email HTML */
    const vehicleStr = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
      : "Your vehicle";
    const customerMsg = safe(message || estimate.customer_message || "");
    const itemRows = items.map((i) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${safe(i.description)}${i.is_required ? ' <strong style="color:#b06d00;font-size:11px;">[Required]</strong>' : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fmtCents(i.line_total_cents)}</td>
      </tr>`
    ).join("");

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Estimate Ready for Review</title></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.12);">
  <div style="background:#0b1b3a;color:#f4ecd8;padding:28px 32px;border-bottom:4px solid #b3201d;text-align:center;">
    <h1 style="margin:0 0 4px;font-size:22px;letter-spacing:1px;">P.A.C.E.</h1>
    <p style="margin:0;font-size:13px;opacity:.7;">Power Automotive Centre of Excellence</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="font-size:16px;color:#1a1f2e;margin:0 0 16px;">Hello${customer ? ` ${safe(customer.first_name)}` : ""},</p>
    <p style="color:#333;line-height:1.6;margin:0 0 20px;">
      Your estimate from <strong>P.A.C.E. Auto Repair</strong> is ready for review.
      Please click the button below to view and approve or decline the work.
    </p>
    ${customerMsg ? `<div style="background:#f9f4ec;border-left:4px solid #b3201d;padding:12px 16px;margin:0 0 20px;border-radius:4px;"><p style="margin:0;color:#333;font-size:14px;">${customerMsg}</p></div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <tr style="background:#f0f2f5;"><th style="padding:8px 12px;text-align:left;color:#5a6478;font-weight:bold;">Estimate #</th><td style="padding:8px 12px;font-family:monospace;font-weight:bold;">${safe(estimate.estimate_number)}</td></tr>
      ${ro ? `<tr><th style="padding:8px 12px;text-align:left;color:#5a6478;font-weight:bold;">Repair Order</th><td style="padding:8px 12px;font-family:monospace;">${safe(ro.ro_number)}</td></tr>` : ""}
      <tr style="background:#f0f2f5;"><th style="padding:8px 12px;text-align:left;color:#5a6478;font-weight:bold;">Vehicle</th><td style="padding:8px 12px;">${safe(vehicleStr)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <thead><tr style="background:#0b1b3a;color:#f4ecd8;"><th style="padding:8px 12px;text-align:left;">Description</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold;">Subtotal:</td><td style="padding:8px 12px;text-align:right;font-family:monospace;">${fmtCents(estimate.subtotal_cents)}</td></tr>
        <tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold;">GST (5%):</td><td style="padding:8px 12px;text-align:right;font-family:monospace;">${fmtCents(estimate.tax_cents)}</td></tr>
        <tr style="background:#f0f2f5;"><td colspan="2" style="padding:10px 12px;text-align:right;font-weight:bold;font-size:16px;">Total:</td><td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:bold;font-size:16px;color:#0b1b3a;">${fmtCents(estimate.total_cents)}</td></tr>
      </tfoot>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${approvalUrl}" style="display:inline-block;background:#b3201d;color:#f4ecd8;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:.5px;">
        Review &amp; Approve Estimate
      </a>
    </div>
    <p style="font-size:13px;color:#888;text-align:center;margin:0;">
      This link expires in 7 days. If you have questions, please call or email us directly.
    </p>
  </div>
  <div style="background:#0b1b3a;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:rgba(244,236,216,.55);">
      P.A.C.E. — Power Automotive Centre of Excellence<br/>
      Unit D 8240-31 St SE, Calgary, AB T2C 1H9 &nbsp;|&nbsp; (403) 453-4554 &nbsp;|&nbsp; admin@powerautomotive.ca
    </p>
  </div>
</div>
</body></html>`;

    /* 11. Send email */
    if (!process.env.RESEND_API_KEY) {
      console.warn("[send-estimate-approval] RESEND_API_KEY not set — skipping email");
    } else {
      await sendEmail({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [customerEmail],
        reply_to: process.env.BUSINESS_EMAIL || "admin@powerautomotive.ca",
        subject: `Your estimate from P.A.C.E. Auto Repair — ${safe(estimate.estimate_number)}`,
        html:    emailHtml,
      });
    }

    console.log(`[send-estimate-approval] Sent estimate ${estimateId} to ${customerEmail} (token hash stored)`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Approval email sent successfully.", estimateNumber: estimate.estimate_number }),
    };
  } catch (err) {
    console.error("[send-estimate-approval] Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ message: "Failed to send approval email. Please try again." }) };
  }
};
