import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Checking — hold render to prevent flash of protected content or premature redirect
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

  // No session, or session exists but user record is missing — redirect to login
  if (!session || !session.user) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}
