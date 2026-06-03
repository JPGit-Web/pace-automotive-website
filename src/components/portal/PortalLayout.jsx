import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/portal.css";
import PortalSidebar from "./PortalSidebar";
import { supabase } from "../../lib/supabase";

export default function PortalLayout({ title, children }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate("/portal", { replace: true });
  };

  return (
    <div className="portalShell">
      <PortalSidebar />

      <div className="portalMain">
        {/* Top header */}
        <header className="portalHeader">
          <div className="portalHeaderLeft">
            <h1 className="portalPageTitle">{title}</h1>
          </div>
          <div className="portalHeaderRight">
            <span className="portalHeaderShop">P.A.C.E. Auto Repair</span>
            <button
              className="portalLogoutBtn"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{ cursor: signingOut ? "not-allowed" : "pointer", opacity: signingOut ? .6 : 1 }}
            >
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="portalContent">
          {children}
        </main>
      </div>
    </div>
  );
}
