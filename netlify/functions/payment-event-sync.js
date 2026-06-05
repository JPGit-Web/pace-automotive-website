// netlify/functions/payment-event-sync.js
//
// Receives Helcim payment events via webhook (Svix delivery infrastructure),
// verifies the HMAC-SHA256 signature, records the event in helcim_payment_events,
// and updates local invoice/repair order payment status.
//
// Webhook delivery URL (configure in Helcim dashboard):
//   https://powerautomotive.ca/.netlify/functions/payment-event-sync
//
// NOTE: The function is named payment-event-sync (not helcim-*) because Helcim
//   may reject delivery URLs that contain the word "helcim".
//
// SECURITY:
//   - HELCIM_WEBHOOK_VERIFIER_TOKEN is used only here, never in src/.
//   - SUPABASE_SERVICE_ROLE_KEY is used only here, never in src/.
//   - HELCIM_API_TOKEN is used only here for fetching transaction details.
//   - Raw payload is sanitized before database insert — no card data is stored.
//   - Never log secrets, card numbers, CVV, expiry, or payment tokens.

import { createHmac, timingSafeEqual } from "crypto";

/* ── Supabase REST helpers ── */
function sbUrl() { return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; }
function sbSrk() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }

function sbHeaders() {
  const key = sbSrk();
  const h = { "apikey": key, "Content-Type": "application/json", "Prefer": "return=representation" };
  if (key?.startsWith("eyJ")) h["Authorization"] = `Bearer ${key}`;
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
  if (!res.ok) throw new Error(`DB patch ${table}: ${res.status}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${sbUrl()}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders(), body: JSON.stringify(body),
  });
  // For activity logs and event inserts, non-fatal on non-2xx
  return res;
}

/* ── Webhook signature verification (Svix / Helcim) ── */
//
// Helcim uses Svix for webhook delivery.
// Svix signing:
//   toSign  = `${msg-id}.${msg-timestamp}.${rawBody}`
//   key     = base64Decode(HELCIM_WEBHOOK_VERIFIER_TOKEN)
//   computed = base64(HMAC-SHA256(key, toSign))
//
// The webhook-signature header contains one or more signatures:
//   "v1,<base64sig>" or "v1,<sig1> v1,<sig2>" (space-separated on older Svix)
//
function verifySignature(webhookId, webhookTimestamp, rawBody, signatureHeader) {
  const token = process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN;
  if (!token) {
    console.warn("[payment-event-sync] HELCIM_WEBHOOK_VERIFIER_TOKEN not set — signature check skipped");
    return false;
  }

  let key;
  try {
    key = Buffer.from(token, "base64");
  } catch {
    console.warn("[payment-event-sync] Could not base64-decode verifier token");
    return false;
  }

  const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const computed = createHmac("sha256", key).update(toSign).digest("base64");
  const computedBuf = Buffer.from(computed);

  // Svix may send multiple signatures separated by spaces
  const signatures = signatureHeader.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  for (const sig of signatures) {
    // Strip version prefix "v1," if present
    const value = sig.includes(",") ? sig.split(",").slice(1).join(",") : sig;
    try {
      const incoming = Buffer.from(value);
      if (incoming.length === computedBuf.length && timingSafeEqual(computedBuf, incoming)) {
        return true;
      }
    } catch { /* different lengths = not equal */ }
  }
  return false;
}

/* ── Helcim transaction detail fetch ── */
//
// Endpoint (v2): GET /v2/card-transactions/{transactionId}
// Adjust if Helcim changes the path — this is isolated in one place.
//
async function fetchHelcimTransaction(transactionId) {
  const apiToken = process.env.HELCIM_API_TOKEN;
  const base     = (process.env.HELCIM_API_BASE_URL || "https://api.helcim.com").replace(/\/+$/, "");
  if (!apiToken || !transactionId) return null;

  try {
    const res = await fetch(`${base}/v2/card-transactions/${transactionId}`, {
      headers: { "api-token": apiToken, "accept": "application/json" },
    });
    if (!res.ok) {
      console.warn(`[payment-event-sync] Transaction fetch ${res.status} for id ${transactionId}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn("[payment-event-sync] Transaction fetch threw:", err.message);
    return null;
  }
}

/* ── Payload sanitizer — remove all card/payment sensitive fields ── */
const SENSITIVE_FIELDS = new Set([
  "cardNumber", "maskedCardNumber", "cardF4L4", "cardCVV", "cardExpiry",
  "bankAccountNumber", "bankRoutingNumber", "bankAccountType",
  "cardToken", "paymentToken", "token", "encryptedCardData",
  "accountNumber", "routingNumber", "pinBlock",
]);

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k)) continue;
    out[k] = (v && typeof v === "object") ? sanitize(v) : v;
  }
  return out;
}

/* ── Activity log (non-fatal) ── */
async function logActivity(action, entityType, entityId, details) {
  try {
    await sbPost("activity_logs", {
      action,
      entity_type: entityType,
      entity_id:   entityId,
      details:     details ? JSON.stringify(details) : null,
    });
  } catch { /* non-fatal */ }
}

/* ── RO payment status sync (only valid RO values) ── */
const RO_PAYMENT_MAP = {
  paid:     "paid",
  partial:  "partial",
  unpaid:   "unpaid",
  refunded: "partial",
  failed:   "unpaid",
  voided:   null,      // do not change RO on void
};

async function syncROPaymentStatus(repairOrderId, paymentStatus) {
  const roStatus = RO_PAYMENT_MAP[paymentStatus];
  if (!roStatus || !repairOrderId) return;
  await sbPatch("repair_orders", { id: `eq.${repairOrderId}` }, { payment_status: roStatus })
    .catch((e) => console.warn("[payment-event-sync] RO sync failed:", e.message));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export const handler = async (event) => {
  /* 1. Method check */
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  /* 2. Extract Svix headers */
  const h = event.headers ?? {};
  const webhookId        = h["webhook-id"]        ?? h["Webhook-Id"]        ?? "";
  const webhookTimestamp = h["webhook-timestamp"]  ?? h["Webhook-Timestamp"] ?? "";
  const webhookSignature = h["webhook-signature"]  ?? h["Webhook-Signature"] ?? "";
  const rawBody          = event.body ?? "";

  if (process.env.NODE_ENV !== "production") {
    console.log("[payment-event-sync] Headers received:", {
      hasSignature:  !!webhookSignature,
      hasTimestamp:  !!webhookTimestamp,
      hasWebhookId:  !!webhookId,
      bodyLength:    rawBody.length,
    });
  }

  /* 3. Signature verification */
  const signatureValid = verifySignature(webhookId, webhookTimestamp, rawBody, webhookSignature);

  if (process.env.NODE_ENV !== "production") {
    console.log("[payment-event-sync] Signature verification:", signatureValid ? "PASSED" : "FAILED");
  }

  if (!signatureValid) {
    console.error("[payment-event-sync] Signature verification failed — rejecting request");
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
  }

  /* 4. Parse body */
  let eventBody;
  try {
    eventBody = JSON.parse(rawBody || "{}");
  } catch {
    console.warn("[payment-event-sync] Could not parse body");
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON body" }) };
  }

  const eventType = eventBody.type ?? "unknown";
  console.log(`[payment-event-sync] Event type: ${eventType}, webhook-id: ${webhookId}`);

  /* 5. Check for duplicate event (idempotency guard) */
  if (webhookId) {
    try {
      const existing = await sbGet("helcim_payment_events", {
        helcim_event_id: `eq.${webhookId}`,
        select: "id",
        limit: "1",
      });
      if (existing?.length > 0) {
        console.log("[payment-event-sync] Duplicate event — already processed:", webhookId);
        await logActivity("invoice.payment_webhook_duplicate", "helcim_payment_events", null,
          { event_type: eventType, helcim_event_id: webhookId });
        return { statusCode: 200, body: JSON.stringify({ message: "Duplicate event — already processed" }) };
      }
    } catch (e) {
      console.warn("[payment-event-sync] Duplicate check failed (non-fatal):", e.message);
    }
  }

  /* 6. Extract initial safe fields from event body */
  const rawTransactionId = eventBody.id ?? eventBody.transactionId ?? null;
  const sanitizedBody    = sanitize(eventBody);

  /* 7. Fetch transaction details for cardTransaction events */
  let txDetails = null;
  if (eventType === "cardTransaction" && rawTransactionId) {
    txDetails = await fetchHelcimTransaction(rawTransactionId);
    if (txDetails && process.env.NODE_ENV !== "production") {
      console.log("[payment-event-sync] Transaction details fetched:", {
        id:            txDetails.id ?? txDetails.transactionId,
        invoiceNumber: txDetails.invoiceNumber ?? null,
        amount:        txDetails.amount ?? null,
        approved:      txDetails.approved ?? txDetails.status ?? null,
      });
    }
  }

  // Extract safe fields from transaction details or event body
  const helcimTransactionId = String(rawTransactionId ?? "");
  const invoiceNumber = txDetails?.invoiceNumber
    ?? eventBody.data?.invoiceNumber
    ?? eventBody.invoiceNumber
    ?? null;
  const amountDollars = txDetails?.amount
    ?? eventBody.data?.transactionAmount
    ?? eventBody.amount
    ?? null;
  const amountCents   = amountDollars != null ? Math.round(parseFloat(amountDollars) * 100) : null;
  const currency      = txDetails?.currency ?? eventBody.data?.currency ?? "CAD";
  const approvalStatus = txDetails?.approved // 1 = approved, 0 = declined on some Helcim versions
    ?? txDetails?.status
    ?? null;
  const occurredAt   = txDetails?.dateCreated ?? txDetails?.createdAt ?? null;

  // Determine payment status from approval
  let paymentStatus = null;
  if (eventType === "cardTransaction") {
    const approved = approvalStatus === 1 || approvalStatus === true
      || String(approvalStatus).toLowerCase() === "approved";
    paymentStatus = approved ? "paid" : "failed";
  } else if (eventType === "terminalCancel") {
    paymentStatus = null; // terminal cancel doesn't confirm payment
  }

  /* 8. Record event in helcim_payment_events */
  let insertedEvent = null;
  try {
    const eventRow = {
      helcim_event_id:       webhookId   || null,
      helcim_transaction_id: helcimTransactionId || null,
      event_type:            eventType,
      payment_status:        paymentStatus,
      amount_cents:          amountCents,
      currency:              currency.toUpperCase().slice(0, 3),
      occurred_at:           occurredAt || null,
      raw_payload:           JSON.stringify(sanitizedBody),
    };

    const res = await sbPost("helcim_payment_events", eventRow);
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      insertedEvent = Array.isArray(rows) ? rows[0] : rows;
      console.log("[payment-event-sync] Event recorded:", insertedEvent?.id ?? "(id unknown)");
    } else {
      const errText = await res.text().catch(() => "");
      console.warn("[payment-event-sync] Event insert non-2xx:", res.status, errText.slice(0, 200));
    }
  } catch (e) {
    console.warn("[payment-event-sync] Event insert threw:", e.message);
  }

  await logActivity("invoice.payment_webhook_received", "helcim_payment_events", insertedEvent?.id ?? null,
    { event_type: eventType, helcim_event_id: webhookId, payment_status: paymentStatus });

  /* 9. Match local invoice */
  let localInvoice = null;
  const lookupAttempts = [
    invoiceNumber ? { helcim_invoice_number: `eq.${invoiceNumber}` } : null,
    invoiceNumber ? { helcim_invoice_id:     `eq.${invoiceNumber}` } : null,
  ].filter(Boolean);

  for (const filter of lookupAttempts) {
    try {
      const rows = await sbGet("helcim_invoices", { ...filter, select: "*", limit: "1" });
      if (rows?.length > 0) { localInvoice = rows[0]; break; }
    } catch { /* non-fatal, try next */ }
  }

  if (!localInvoice && invoiceNumber) {
    // Final attempt: check repair_orders.helcim_invoice_id
    try {
      const ros = await sbGet("repair_orders", {
        helcim_invoice_id: `eq.${invoiceNumber}`,
        select: "id",
        limit: "1",
      });
      if (ros?.length > 0) {
        const rows = await sbGet("helcim_invoices", {
          repair_order_id: `eq.${ros[0].id}`,
          select: "*",
          limit: "1",
          order: "created_at.desc",
        });
        if (rows?.length > 0) localInvoice = rows[0];
      }
    } catch { /* non-fatal */ }
  }

  if (!localInvoice) {
    console.warn("[payment-event-sync] No matching local invoice for invoice number:", invoiceNumber ?? "(unknown)");
    return { statusCode: 200, body: JSON.stringify({ message: "Event recorded — no matching local invoice" }) };
  }

  /* 10. Update helcim_payment_events row with invoice link */
  if (insertedEvent?.id && localInvoice.id) {
    await sbPatch("helcim_payment_events",
      { id: `eq.${insertedEvent.id}` },
      { helcim_invoice_id: localInvoice.id, repair_order_id: localInvoice.repair_order_id }
    ).catch(() => {});
  }

  /* 11. Update local invoice payment status */
  if (paymentStatus && eventType === "cardTransaction") {
    // Do not downgrade a paid invoice to failed
    const isAlreadyPaid = localInvoice.payment_status === "paid";
    if (isAlreadyPaid && paymentStatus === "failed") {
      console.log("[payment-event-sync] Invoice already paid — not downgrading to failed");
    } else {
      const totalCents = localInvoice.total_cents ?? 0;
      const paidCents  = paymentStatus === "paid" ? totalCents : (amountCents ?? 0);
      const dueCents   = Math.max(0, totalCents - paidCents);

      // Refine status if amount is partial
      let finalStatus = paymentStatus;
      if (paymentStatus === "paid" && amountCents != null && amountCents < totalCents) {
        finalStatus = "partial";
      }

      const now = new Date().toISOString();
      const invPatch = {
        payment_status:    finalStatus,
        amount_paid_cents: paidCents,
        amount_due_cents:  dueCents,
        last_synced_at:    now,
        sync_error:        null,
      };
      if (finalStatus === "paid") invPatch.paid_at = now;

      try {
        await sbPatch("helcim_invoices", { id: `eq.${localInvoice.id}` }, invPatch);
        console.log(`[payment-event-sync] Invoice ${localInvoice.id} updated: ${finalStatus}`);

        // Sync to repair_orders
        if (localInvoice.repair_order_id) {
          await syncROPaymentStatus(localInvoice.repair_order_id, finalStatus);
        }

        await logActivity("invoice.payment_synced", "helcim_invoice", localInvoice.id, {
          event_type: eventType, payment_status: finalStatus, amount_cents: paidCents,
        });
      } catch (e) {
        console.error("[payment-event-sync] Invoice update failed:", e.message);
        await logActivity("invoice.payment_sync_failed", "helcim_invoice", localInvoice.id,
          { error: e.message });
      }
    }
  }

  if (paymentStatus === "failed") {
    await logActivity("invoice.payment_declined", "helcim_invoice", localInvoice.id,
      { event_type: eventType });
  }

  /* 12. Always return 200 — non-200 triggers Svix retries */
  return { statusCode: 200, body: JSON.stringify({ message: "Event processed" }) };
};
