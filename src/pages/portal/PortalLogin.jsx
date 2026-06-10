import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "../../styles/portal.css";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [pin,        setPin]        = useState("");
  const [showPin,    setShowPin]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  // If already logged in, skip the login page entirely
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/portal/dashboard", { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Basic client-side guard — server re-validates everything
    if (!identifier.trim()) {
      setError("Please enter your username or email.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/.netlify/functions/portal-pin-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ identifier: identifier.trim(), pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Unable to sign in. Please try again.");
        return;
      }

      // Establish the Supabase session using the tokens returned by the function.
      // The real password never touches the browser.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        console.error("[PortalLogin] setSession error:", sessionError.message);
        setError("Session error. Please try again.");
        return;
      }

      navigate("/portal/dashboard", { replace: true });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portalLoginPage">
      <div className="portalLoginCard">
        <h1 className="portalLoginLogo">P.A.C.E.</h1>
        <p className="portalLoginSub">
          Power Automotive Centre of Excellence
          <br />
          Staff Portal
        </p>
        <hr className="portalLoginDivider" />

        <p style={{ fontSize: ".78rem", color: "#7a8299", textAlign: "center", margin: "0 0 16px", lineHeight: 1.5 }}>
          Enter your staff username or email and PIN.
        </p>

        <form onSubmit={handleSubmit} style={{ textAlign: "left" }}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="identifier">Username or Email</label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={styles.input}
              placeholder="username"
              disabled={loading}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div style={{ ...styles.field, marginBottom: "20px" }}>
            <label style={styles.label} htmlFor="pin">PIN</label>
            <div style={{ position: "relative" }}>
              <input
                id="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  // Strip non-digits and cap at 4 characters
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setPin(digits);
                }}
                style={{ ...styles.input, paddingRight: "42px", letterSpacing: showPin ? "0.2em" : "0.3em" }}
                placeholder="••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                tabIndex={0}
                style={{
                  position: "absolute", right: "10px", top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none",
                  cursor: "pointer", padding: "4px",
                  color: "#9aa0ae", fontSize: ".9rem",
                  lineHeight: 1,
                }}
              >
                <i className={showPin ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"}></i>
              </button>
            </div>
          </div>

          {error && (
            <div style={styles.errorBox} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="portalSignInBtn"
            disabled={loading}
            style={{ opacity: loading ? .6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={styles.staffNote}>
          Authorized P.A.C.E. staff only.
        </p>
      </div>
    </div>
  );
}

const styles = {
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "14px",
  },
  label: {
    fontSize: ".78rem",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: ".6px",
    color: "#5a6478",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #e2e6ea",
    borderRadius: "6px",
    fontSize: ".92rem",
    fontFamily: "inherit",
    color: "#1a1f2e",
    outline: "none",
    background: "#fafbfc",
    transition: "border-color .15s",
    boxSizing: "border-box",
  },
  errorBox: {
    background: "#fdecea",
    border: "1px solid #f4c0bc",
    borderRadius: "6px",
    padding: "10px 14px",
    fontSize: ".83rem",
    color: "#8b1c18",
    marginBottom: "14px",
    lineHeight: "1.5",
  },
  staffNote: {
    marginTop: "16px",
    fontSize: ".72rem",
    color: "#9aa0ae",
    textAlign: "center",
  },
};
