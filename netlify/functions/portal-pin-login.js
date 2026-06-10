// netlify/functions/portal-pin-login.js
//
// Staff-only PIN login endpoint for the P.A.C.E. portal.
//
// Flow:
//   1. Staff types their username/email + 4-digit PIN in PortalLogin.jsx.
//   2. The frontend POSTs { identifier, pin } to this function.
//   3. This function computes sha256(PORTAL_LOGIN_PIN_SALT + ":" + pin) and
//      compares it to PORTAL_LOGIN_PIN_HASH using timingSafeEqual.
//      The raw PIN is never stored — only a salted hash is held in env vars.
//   4. If valid, it signs in with Supabase Auth using the real staff email
//      + PORTAL_ADMIN_PASSWORD (both server-side env vars — never exposed to
//      the browser).
//   5. Returns { access_token, refresh_token, expires_at, user_email }.
//   6. Frontend calls supabase.auth.setSession({ access_token, refresh_token })
//      to establish the session, then navigates to /portal/dashboard.
//
// Security guarantees:
//   - PORTAL_ADMIN_PASSWORD is NEVER sent to the browser.
//   - Raw PIN is never stored — only a salted SHA-256 hash (PORTAL_LOGIN_PIN_HASH).
//   - Hash comparison uses timingSafeEqual to prevent timing attacks.
//   - Only generic error messages are returned — no hint of which field failed.
//   - Nothing sensitive (PIN, hash, password) is logged.
//
// To generate PORTAL_LOGIN_PIN_HASH locally:
//   node -e "
//     const crypto = require('crypto');
//     const pin  = '8240';               // your actual PIN
//     const salt = 'CHANGE_ME_RANDOM';   // your actual PORTAL_LOGIN_PIN_SALT
//     console.log(crypto.createHash('sha256').update(\`\${salt}:\${pin}\`).digest('hex'));
//   "

const crypto = require("crypto");

// ── Supabase auth helpers ────────────────────────────────────────────────────
function sbUrl()  { return process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL; }
function sbAnon() { return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY; }

async function supabaseSignIn(email, password) {
  const res = await fetch(`${sbUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "apikey":       sbAnon(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error_description || data?.message || `Auth error ${res.status}`);
  }
  return data; // { access_token, refresh_token, expires_in, expires_at, user, ... }
}

// ── PIN hash verification ────────────────────────────────────────────────────
function verifyPin(pin, salt, expectedHash) {
  const computed = crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
  // timingSafeEqual requires equal-length Buffers
  const a = Buffer.from(computed,      "hex");
  const b = Buffer.from(expectedHash,  "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) };
  }

  const { identifier, pin } = body;

  // ── 2. Basic input shape validation ────────────────────────────────────────
  if (typeof identifier !== "string" || !identifier.trim()) {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }
  if (typeof pin !== "string") {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 3. Check required env vars ──────────────────────────────────────────────
  const PIN_HASH      = process.env.PORTAL_LOGIN_PIN_HASH;
  const PIN_SALT      = process.env.PORTAL_LOGIN_PIN_SALT;
  const PORTAL_EMAIL    = process.env.PORTAL_ADMIN_EMAIL;
  const PORTAL_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD;
  const SUPABASE_URL    = sbUrl();
  const SUPABASE_ANON   = sbAnon();

  if (!PIN_HASH || !PIN_SALT || !PORTAL_EMAIL || !PORTAL_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON) {
    console.error("[portal-pin-login] Missing required server env vars. Check: PORTAL_LOGIN_PIN_HASH, PORTAL_LOGIN_PIN_SALT, PORTAL_ADMIN_EMAIL, PORTAL_ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY.");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Portal login is not configured. Contact the administrator." }),
    };
  }

  // ── 4. Validate PIN format (must be exactly 4 digits) ──────────────────────
  if (!/^\d{4}$/.test(pin)) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 5. Validate PIN via salted hash comparison ─────────────────────────────
  if (!verifyPin(pin, PIN_SALT, PIN_HASH)) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 6. Normalize identifier → email ────────────────────────────────────────
  let email;
  const id = identifier.trim().toLowerCase();

  if (id.includes("@")) {
    email = identifier.trim().toLowerCase();
  } else if (id === "paceadmin" || id === "admin") {
    email = PORTAL_EMAIL;
  } else {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // Guard: resolved email must match PORTAL_ADMIN_EMAIL
  if (email !== PORTAL_EMAIL.toLowerCase()) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 7. Sign in with Supabase Auth ──────────────────────────────────────────
  try {
    const session = await supabaseSignIn(email, PORTAL_PASSWORD);

    const redacted = email.replace(/(?<=.{2}).+(?=@)/, "***");
    console.log(`[portal-pin-login] Successful login for ${redacted}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
        expires_at:    session.expires_at ?? null,
        user_email:    session.user?.email ?? null,
      }),
    };
  } catch (err) {
    console.error("[portal-pin-login] Supabase auth failed:", err.message);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unable to sign in. Please check your credentials and try again." }),
    };
  }
};
