// netlify/functions/send-appointment-reply.js
// Staff-only: sends a reply email to a customer about their appointment request.
// Also saves reply_message + replied_at on the appointment row and promotes
// status from 'pending' → 'processing'.
//
// Requires a valid staff Supabase access token in the Authorization header.
// SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY are server-side only —
// never in src/.

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
    method: "PATCH",
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DB patch error ${table}: ${res.status}`);
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

/* ── Send email via Resend ── */
async function sendEmail(payload) {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Email error: ${res.status}`);
}

function safe(s = "") { return String(s).replace(/[\r\n<>]/g, " ").trim().slice(0, 500); }

function fmtScheduled(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-CA", {
    timeZone:   "America/Edmonton",
    weekday:    "long",
    year:       "numeric",
    month:      "long",
    day:        "numeric",
    hour:       "numeric",
    minute:     "2-digit",
  });
}

/* ════════════════════════════════════════════════════════════ */
export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };

  /* 1. Parse body */
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) }; }

  const { appointmentId, replyMessage } = body;

  if (!appointmentId)
    return { statusCode: 400, body: JSON.stringify({ message: "appointmentId required" }) };
  if (!replyMessage?.trim())
    return { statusCode: 400, body: JSON.stringify({ message: "replyMessage required" }) };

  /* 2. Verify staff */
  const staff = await verifyStaff(event.headers?.authorization || event.headers?.Authorization);
  if (!staff?.id)
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };

  /* 3. Check server config */
  const SUPABASE_URL = sbUrl();
  const SUPABASE_SRK = sbSrk();
  if (!SUPABASE_URL || !SUPABASE_SRK) {
    console.error("[send-appointment-reply] Missing Supabase server env vars");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error" }) };
  }

  const FROM_EMAIL = process.env.FROM_EMAIL  || "noreply@powerautomotive.ca";
  const FROM_NAME  = process.env.FROM_NAME   || "P.A.C.E. Auto Repair";

  try {
    /* 4. Fetch appointment request */
    const rows = await sbGet("appointment_requests", {
      id:     `eq.${appointmentId}`,
      select: "id,name,email,phone,vehicle_info,service_requested,preferred_date,notes,status,scheduled_start,scheduled_service",
    });
    const appt = rows[0];
    if (!appt)
      return { statusCode: 404, body: JSON.stringify({ message: "Appointment request not found" }) };

    /* 5. Guard: no email address */
    if (!appt.email?.trim())
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "No customer email on this request.", code: "NO_EMAIL" }),
      };

    /* 6. Build email HTML */
    const customerName    = safe(appt.name || "there");
    const serviceLabel    = safe(appt.scheduled_service || appt.service_requested || "");
    const vehicleLabel    = safe(appt.vehicle_info || "");
    const scheduledLabel  = fmtScheduled(appt.scheduled_start);
    const safeReply       = safe(replyMessage);

    const scheduledBlock = scheduledLabel
      ? `<div style="background:#f0f4ff;border-left:4px solid #1d4ed8;padding:12px 16px;margin:16px 0;border-radius:4px;">
           <p style="margin:0;font-size:14px;color:#1e3a8a;">
             <strong>Your appointment has been scheduled for:</strong><br/>
             ${scheduledLabel}
           </p>
         </div>`
      : "";

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Reply from P.A.C.E. Auto Repair</title>
</head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.12);">
    <div style="background:#0b1b3a;color:#f4ecd8;padding:28px 32px;border-bottom:4px solid #b3201d;text-align:center;">
      <h1 style="margin:0 0 4px;font-size:22px;letter-spacing:1px;">P.A.C.E.</h1>
      <p style="margin:0;font-size:13px;opacity:.7;">Power Automotive Centre of Excellence</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:16px;color:#1a1f2e;margin:0 0 16px;">Hi ${customerName},</p>
      <p style="color:#333;line-height:1.6;margin:0 0 4px;">
        Thank you for reaching out to <strong>P.A.C.E. — Power Automotive Centre of Excellence</strong>.
        Here is a message from our team regarding your appointment request:
      </p>

      ${serviceLabel ? `<p style="font-size:13px;color:#555;margin:0 0 16px;">
        <strong>Service:</strong> ${serviceLabel}${vehicleLabel ? `&nbsp;|&nbsp;<strong>Vehicle:</strong> ${vehicleLabel}` : ""}
      </p>` : ""}

      <div style="background:#f9f4ec;border-left:4px solid #b3201d;padding:14px 16px;margin:0 0 20px;border-radius:4px;">
        <p style="margin:0;color:#333;font-size:15px;line-height:1.65;white-space:pre-wrap;">${safeReply}</p>
      </div>

      ${scheduledBlock}

      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 6px;">
        If you have any questions, please don't hesitate to reach us:
      </p>
      <table style="font-size:14px;color:#333;border-collapse:collapse;">
        <tr><td style="padding:3px 12px 3px 0;">📞</td><td><a href="tel:+15875792695" style="color:#0b1b3a;font-weight:bold;">(587) 579-2695</a></td></tr>
        <tr><td style="padding:3px 12px 3px 0;">✉️</td><td><a href="mailto:admin@powerautomotive.ca" style="color:#0b1b3a;font-weight:bold;">admin@powerautomotive.ca</a></td></tr>
        <tr><td style="padding:3px 12px 3px 0;">🌐</td><td><a href="https://powerautomotive.ca" style="color:#0b1b3a;font-weight:bold;">powerautomotive.ca</a></td></tr>
      </table>

      <p style="margin:20px 0 0;color:#666;font-size:13px;">— The P.A.C.E. Team</p>
    </div>
    <div style="background:#0b1b3a;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:rgba(244,236,216,.55);">
        P.A.C.E. — Power Automotive Centre of Excellence<br/>
        (587) 579-2695 &nbsp;|&nbsp; admin@powerautomotive.ca &nbsp;|&nbsp; powerautomotive.ca
      </p>
    </div>
  </div>
</body>
</html>`;

    /* 7. Send email */
    if (!process.env.RESEND_API_KEY) {
      console.warn("[send-appointment-reply] RESEND_API_KEY not set — skipping email");
    } else {
      await sendEmail({
        from:     `${FROM_NAME} <${FROM_EMAIL}>`,
        to:       [appt.email.trim()],
        reply_to: process.env.BUSINESS_EMAIL || "admin@powerautomotive.ca",
        subject:  `Re: Your appointment request — P.A.C.E. Auto Repair`,
        html:     emailHtml,
      });
    }

    /* 8. Update appointment row: save reply + promote status if still pending */
    const updateFields = {
      reply_message: replyMessage.trim(),
      replied_at:    new Date().toISOString(),
    };
    if (appt.status === "pending") updateFields.status = "processing";

    try {
      await sbPatch("appointment_requests", { id: `eq.${appointmentId}` }, updateFields);
    } catch (dbErr) {
      // Email already sent — log the DB error but return success to the caller
      console.error("[send-appointment-reply] DB patch after send failed:", dbErr.message);
    }

    // Redact email for logs
    const redacted = appt.email.replace(/(?<=.{2}).+(?=@)/, "***");
    console.log(`[send-appointment-reply] Reply sent for appt ${appointmentId} to ${redacted}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Reply sent successfully." }),
    };

  } catch (err) {
    console.error("[send-appointment-reply] Error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to send reply. Please try again." }),
    };
  }
};
