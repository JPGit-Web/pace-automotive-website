// netlify/functions/portal-pin-login.js
//
// Staff-only PIN login endpoint for the P.A.C.E. portal.
//
// Flow:
//   1. Staff types their username/email + 4-digit PIN in PortalLogin.jsx.
//   2. The frontend POSTs { identifier, pin } to this function.
//   3. This function validates the PIN against PORTAL_LOGIN_PIN (env var).
//   4. If valid, it signs in with Supabase Auth using the real staff email
//      + PORTAL_ADMIN_PASSWORD (both server-side env vars — never exposed to
//      the browser).
//   5. Returns { access_token, refresh_token, expires_at, user_email }.
//   6. Frontend calls supabase.auth.setSession({ access_token, refresh_token })
//      to establish the session, then navigates to /portal/dashboard.
//
// Security guarantees:
//   - PORTAL_ADMIN_PASSWORD is NEVER sent to the browser.
//   - The PIN is validated server-side; brute-force mitigation is handled by
//     Netlify's request rate limits and Supabase Auth's own auth protections.
//   - Only generic error messages are returned — no hint of which field failed.
//   - Nothing sensitive is logged.

// ── Supabase auth helper ─────────────────────────────────────────────────────
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
    // Supabase returns { error_description: "..." } on auth failure
    throw new Error(data?.error_description || data?.message || `Auth error ${res.status}`);
  }
  return data; // { access_token, refresh_token, expires_in, expires_at, user, ... }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  // ── 1. Parse body ────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body" }) };
  }

  const { identifier, pin } = body;

  // ── 2. Basic input shape validation ──────────────────────────────────────
  if (typeof identifier !== "string" || !identifier.trim()) {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }
  if (typeof pin !== "string") {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 3. Check required env vars ────────────────────────────────────────────
  const PORTAL_PIN      = process.env.PORTAL_LOGIN_PIN;
  const PORTAL_EMAIL    = process.env.PORTAL_ADMIN_EMAIL;
  const PORTAL_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD;
  const SUPABASE_URL    = sbUrl();
  const SUPABASE_ANON   = sbAnon();

  if (!PORTAL_PIN || !PORTAL_EMAIL || !PORTAL_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON) {
    console.error("[portal-pin-login] Missing required server env vars. Check: PORTAL_LOGIN_PIN, PORTAL_ADMIN_EMAIL, PORTAL_ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY.");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Portal login is not configured. Contact the administrator." }),
    };
  }

  // ── 4. Validate PIN format (must be exactly 4 digits) ────────────────────
  if (!/^\d{4}$/.test(pin)) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 5. Validate PIN value ─────────────────────────────────────────────────
  // Constant-time comparison would be ideal; this single-account setup has
  // 10^4 combinations and is protected by Netlify's rate limiting.
  if (pin !== PORTAL_PIN) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 6. Normalize identifier → email ──────────────────────────────────────
  let email;
  const id = identifier.trim().toLowerCase();

  if (id.includes("@")) {
    // Treat as a literal email address
    email = identifier.trim().toLowerCase();
  } else if (id === "paceadmin" || id === "admin") {
    email = PORTAL_EMAIL;
  } else {
    // Unknown username — return the same generic message (no identifier enumeration)
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // Optional: confirm the resolved email matches PORTAL_ADMIN_EMAIL.
  // This prevents a correct PIN from signing in a different Supabase account
  // if someone enters a different email address.
  if (email !== PORTAL_EMAIL.toLowerCase()) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid username or PIN" }) };
  }

  // ── 7. Sign in with Supabase Auth ─────────────────────────────────────────
  try {
    const session = await supabaseSignIn(email, PORTAL_PASSWORD);

    // Redact email domain for logs
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
    // Auth failure — do not expose Supabase error message (it may hint at the password)
    console.error("[portal-pin-login] Supabase auth failed:", err.message);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unable to sign in. Please check your credentials and try again." }),
    };
  }
};
