import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/portal.css";
import PortalSidebar from "./PortalSidebar";
import { supabase } from "../../lib/supabase";
import { useInactivityTimer } from "../../hooks/useInactivityTimer";

export default function PortalLayout({ title, children }) {
  const navigate = useNavigate();
  const [signingOut,       setSigningOut]       = useState(false);
  const [userEmail,        setUserEmail]         = useState("");
  const [showIdleWarning,  setShowIdleWarning]   = useState(false);
  const [countdown,        setCountdown]         = useState(60);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? "");
    });
  }, []);

  /* ── Sign-out ── */
  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    setShowIdleWarning(false);
    await supabase.auth.signOut();
    navigate("/portal", { replace: true });
  }, [navigate]);

  /* ── Inactivity: show warning ── */
  const handleIdle = useCallback(() => {
    setShowIdleWarning(true);
    setCountdown(60);
  }, []);

  /* ── Inactivity: grace period expired — sign out ── */
  const handleExpire = useCallback(() => {
    handleSignOut();
  }, [handleSignOut]);

  /* ── "Stay Signed In" clicked ── */
  const { resetTimer } = useInactivityTimer({
    idleMs:   10 * 60 * 1000,  // 10 minutes
    warningMs: 60 * 1000,       // 60 second grace period
    onIdle:   handleIdle,
    onExpire: handleExpire,
    enabled:  true,
  });

  const handleStaySignedIn = useCallback(() => {
    setShowIdleWarning(false);
    resetTimer();
  }, [resetTimer]);

  /* ── Countdown ticker while warning is showing ── */
  useEffect(() => {
    if (!showIdleWarning) return;
    setCountdown(60);
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(tick); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [showIdleWarning]);

  return (
    <div className="portalShell">
      <PortalSidebar />

      <div className="portalMain">
        <header className="portalHeader">
          <div className="portalHeaderLeft">
            <h1 className="portalPageTitle">{title}</h1>
          </div>
          <div className="portalHeaderRight">
            {userEmail && (
              <span className="portalHeaderShop" title={userEmail}>
                Signed in as {userEmail}
              </span>
            )}
            <button
              className="portalLogoutBtn"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                cursor:  signingOut ? "not-allowed" : "pointer",
                opacity: signingOut ? .6 : 1,
              }}
            >
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </header>

        <main className="portalContent">
          {children}
        </main>
      </div>

      {/* ── Inactivity warning modal ── */}
      {showIdleWarning && (
        <div className="portalModalOverlay" style={{ zIndex: 9999 }}>
          <div className="portalModalCard" style={{ maxWidth: "420px", textAlign: "center" }}
            role="alertdialog" aria-modal="true" aria-labelledby="idle-warning-title">
            <div className="portalModalHeader" style={{ justifyContent: "center", borderBottom: "none", paddingBottom: 0 }}>
              <i className="fa-solid fa-clock" style={{ fontSize: "2rem", color: "var(--p-warning)", marginBottom: "8px" }}></i>
            </div>
            <div className="portalModalBody" style={{ textAlign: "center", paddingTop: "4px" }}>
              <h2 id="idle-warning-title" style={{ margin: "0 0 10px", fontSize: "1.1rem", fontWeight: 800, color: "var(--p-text)" }}>
                Still there?
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: ".9rem", color: "var(--p-text-2)", lineHeight: 1.6 }}>
                Your session will expire due to inactivity.
                You will be signed out in <strong style={{ color: "var(--p-danger)" }}>{countdown}</strong> second{countdown !== 1 ? "s" : ""}.
              </p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                <button className="portalBtn portalBtnPrimary" onClick={handleStaySignedIn} autoFocus>
                  <i className="fa-solid fa-circle-check"></i> Stay Signed In
                </button>
                <button className="portalBtn portalBtnSecondary" onClick={handleSignOut}>
                  Sign Out Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
