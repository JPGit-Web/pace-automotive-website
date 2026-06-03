import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Keep session state in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still checking — render nothing to avoid flash of login redirect
  if (session === undefined) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
        color: "#5a6478",
        fontSize: ".9rem",
      }}>
        Loading…
      </div>
    );
  }

  // No valid session → send to portal login
  if (!session) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}
