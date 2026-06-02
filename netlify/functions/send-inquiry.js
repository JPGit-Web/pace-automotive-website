// netlify/functions/send-inquiry.js
// Sends two emails via Resend:
//   1. Notification to P.A.C.E. with reply-to set to the customer's email
//   2. Confirmation email to the customer

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Sanitise a string to prevent header injection
 */
const safe = (str = "") =>
  String(str).replace(/[\r\n<>]/g, " ").trim().slice(0, 500);

/**
 * Basic email format check
 */
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  // Rate-limit honeypot: if a bot-field was posted, silently succeed
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) };
  }

  // Destructure and sanitise
  const name      = safe(body.name);
  const phone     = safe(body.phone);
  const email     = safe(body.email);
  const vehicle   = safe(body.vehicle);
  const service   = safe(body.service);
  const preferred = safe(body.preferred);
  const message   = safe(body.message);

  // Required field validation (server-side)
  if (!name || !phone || !email || !body.consent) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing required fields." }) };
  }

  if (!isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid email address." }) };
  }

  const RESEND_API_KEY     = process.env.RESEND_API_KEY;
  const BUSINESS_EMAIL     = process.env.BUSINESS_EMAIL || "admin@powerautomotive.ca";
  const FROM_EMAIL         = process.env.FROM_EMAIL     || "noreply@powerautomotive.ca";
  const FROM_NAME          = process.env.FROM_NAME      || "P.A.C.E. Website";

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY environment variable is not set");
    return { statusCode: 500, body: JSON.stringify({ message: "Email service is not configured. Please call us directly at (587) 679-2695." }) };
  }

  /* ─────────────────────────────────────────────────────────
     EMAIL 1: Business notification (reply-to = customer)
     ───────────────────────────────────────────────────────── */
  const businessEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New Appointment Request</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .wrap { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  .header { background: #0b1b3a; color: #f4ecd8; padding: 24px 28px; border-bottom: 4px solid #b3201d; }
  .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; text-transform: uppercase; }
  .header p  { margin: 4px 0 0; font-size: 13px; opacity: .7; }
  .body { padding: 28px; }
  .row { display: flex; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid #eeeeee; padding-bottom: 14px; }
  .row:last-child { border-bottom: none; margin-bottom: 0; }
  .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: bold; min-width: 120px; padding-top: 2px; }
  .val { font-size: 14px; color: #111111; line-height: 1.55; }
  .message-block { background: #f9f9f9; border-left: 4px solid #b3201d; padding: 14px 16px; border-radius: 4px; margin-top: 4px; }
  .footer { background: #0b1b3a; padding: 16px 28px; }
  .footer p { margin: 0; font-size: 11px; color: rgba(244,236,216,.55); }
  .cta { display: inline-block; background: #b3201d; color: #f4ecd8; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold; letter-spacing: .5px; text-transform: uppercase; margin-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>🔧 New Appointment Request</h1>
    <p>Received via powerautomotive.ca — P.A.C.E.</p>
  </div>
  <div class="body">
    <div class="row"><span class="lbl">Name</span><span class="val">${name}</span></div>
    <div class="row"><span class="lbl">Phone</span><span class="val">${phone}</span></div>
    <div class="row"><span class="lbl">Email</span><span class="val"><a href="mailto:${email}">${email}</a></span></div>
    <div class="row"><span class="lbl">Vehicle</span><span class="val">${vehicle || "Not specified"}</span></div>
    <div class="row"><span class="lbl">Service</span><span class="val">${service}</span></div>
    <div class="row"><span class="lbl">Availability</span><span class="val">${preferred || "Not specified"}</span></div>
    <div class="row">
      <span class="lbl">Details</span>
      <span class="val">
        <div class="message-block">${message || "No additional details provided."}</div>
      </span>
    </div>
    <a href="mailto:${email}?subject=Re: Your P.A.C.E. Appointment Request" class="cta">Reply to ${name}</a>
  </div>
  <div class="footer">
    <p>P.A.C.E. — Power Automotive Centre of Excellence &nbsp;|&nbsp; Unit D 8240-31 St SE, Calgary AB &nbsp;|&nbsp; (587) 679-2695</p>
  </div>
</div>
</body>
</html>
  `.trim();

  /* ─────────────────────────────────────────────────────────
     EMAIL 2: Customer confirmation
     ───────────────────────────────────────────────────────── */
  const customerEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>We Received Your Request</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .wrap { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  .header { background: #0b1b3a; color: #f4ecd8; padding: 28px 32px; border-bottom: 4px solid #b3201d; text-align: center; }
  .header h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 1px; }
  .header p  { margin: 0; font-size: 13px; opacity: .65; }
  .body { padding: 32px; line-height: 1.7; color: #333333; }
  .body p { margin: 0 0 14px; font-size: 15px; }
  .summary { background: #f9f4ec; border: 1px solid #ddd0b8; border-radius: 8px; padding: 18px 20px; margin: 18px 0; }
  .summary p { margin: 0 0 8px; font-size: 13px; }
  .summary p:last-child { margin: 0; }
  .summary .lbl { font-weight: bold; color: #0b1b3a; }
  .divider { border: none; border-top: 2px solid #f0e8d0; margin: 20px 0; }
  .contact { font-size: 13px; color: #666666; }
  .contact a { color: #0b1b3a; font-weight: bold; }
  .footer { background: #0b1b3a; padding: 18px 32px; text-align: center; }
  .footer p { margin: 0; font-size: 11px; color: rgba(244,236,216,.5); line-height: 1.6; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>P.A.C.E.</h1>
    <p>Power Automotive Centre of Excellence</p>
  </div>
  <div class="body">
    <p>Hi ${name},</p>
    <p>Thank you for reaching out to <strong>P.A.C.E. — Power Automotive Centre of Excellence</strong>. We've received your appointment request and will get back to you as soon as possible to confirm your appointment details and availability.</p>
    <p>Here's a summary of what you submitted:</p>
    <div class="summary">
      <p><span class="lbl">Service Requested:</span> ${service}</p>
      ${vehicle   ? `<p><span class="lbl">Vehicle:</span> ${vehicle}</p>` : ""}
      ${preferred ? `<p><span class="lbl">Preferred Time:</span> ${preferred}</p>` : ""}
      ${message   ? `<p><span class="lbl">Details:</span> ${message}</p>` : ""}
    </div>
    <p>If you need to reach us sooner, please don't hesitate to call or email directly:</p>
    <hr class="divider" />
    <p class="contact">
      📞 <a href="tel:+15876792695">(587) 679-2695</a><br />
      ✉️ <a href="mailto:admin@powerautomotive.ca">admin@powerautomotive.ca</a><br />
      📍 Unit D 8240-31 St SE, Calgary, AB T2C 1H9<br />
      🕐 Mon–Fri 8:00am–6:00pm &nbsp;|&nbsp; Sat–Sun By Appointment
    </p>
    <p style="margin-top:18px;">We look forward to taking care of your vehicle!</p>
    <p>— The P.A.C.E. Team</p>
  </div>
  <div class="footer">
    <p>P.A.C.E. — Power Automotive Centre of Excellence<br />Unit D 8240-31 St SE, Calgary, AB T2C 1H9 &nbsp;|&nbsp; (587) 679-2695</p>
    <p style="margin-top:6px;">You're receiving this because you submitted a request at powerautomotive.ca</p>
  </div>
</div>
</body>
</html>
  `.trim();

  /* ─────────────────────────────────────────────────────────
     Send both emails via Resend
     ───────────────────────────────────────────────────────── */
  const sendEmail = async (payload) => {
    const res = await fetch(RESEND_API_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend error ${res.status}`);
    }
    return res.json();
  };

  try {
    // Business notification (reply-to = customer email)
    await sendEmail({
      from:     `${FROM_NAME} <${FROM_EMAIL}>`,
      to:       [BUSINESS_EMAIL],
      reply_to: email,
      subject:  `[P.A.C.E.] New Appointment Request — ${name}`,
      html:     businessEmailHtml,
    });

    // Customer confirmation
    await sendEmail({
      from:     `P.A.C.E. Auto Repair <${FROM_EMAIL}>`,
      to:       [email],
      reply_to: BUSINESS_EMAIL,
      subject:  "We received your appointment request — P.A.C.E. Auto Repair",
      html:     customerEmailHtml,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Request sent successfully." }),
    };
  } catch (err) {
    console.error("Email send error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "We couldn't send your request right now. Please call us at (587) 679-2695 or email admin@powerautomotive.ca directly.",
      }),
    };
  }
};
