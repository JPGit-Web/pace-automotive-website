import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "../../styles/portal.css";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPassword,setShowPassword]= useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  // If already logged in, skip the login page entirely
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/portal/dashboard", { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      // Generic message — never reveal whether the email or password is wrong
      setError("Unable to sign in. Please check your credentials and try again.");
      return;
    }

    navigate("/portal/dashboard", { replace: true });
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

        <form onSubmit={handleSubmit} style={{ textAlign: "left" }}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="staff@example.com"
              disabled={loading}
            />
          </div>

          <div style={{ ...styles.field, marginBottom: "20px" }}>
            <label style={styles.label} htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...styles.input, paddingRight: "42px" }}
                placeholder="••••••••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
                <i className={showPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"}></i>
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
