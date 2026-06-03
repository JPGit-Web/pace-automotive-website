// Phase 1 placeholder — real token lookup and approval UI built in Phase 8
// URL pattern: /approve/:token

import { useParams } from "react-router-dom";

export default function ApprovalPage() {
  const { token } = useParams();

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Customer Approval</h1>
        <p style={styles.subtitle}>P.A.C.E. — Power Automotive Centre of Excellence</p>
        <hr style={styles.divider} />
        <p style={styles.message}>📄 Approval links coming soon</p>
        <p style={styles.note}>
          Estimate and inspection approval links will appear here in Phase 8.
          <br /><br />
          Secure token lookup and customer-facing approval UI will be built once
          Supabase and the estimates workflow are in place.
        </p>
        {token && (
          <p style={styles.token}>Token received: <code>{token}</code></p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b1b3a",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    backgroundColor: "#f4ecd8",
    borderRadius: "12px",
    padding: "40px 48px",
    maxWidth: "480px",
    width: "90%",
    textAlign: "center",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  title: {
    margin: "0 0 6px",
    fontSize: "1.6rem",
    color: "#0b1b3a",
    fontWeight: "700",
  },
  subtitle: {
    margin: "0 0 20px",
    fontSize: "0.85rem",
    color: "#555",
  },
  divider: {
    border: "none",
    borderTop: "2px solid #d9cdb0",
    margin: "0 0 20px",
  },
  message: {
    fontSize: "1.1rem",
    color: "#0b1b3a",
    fontWeight: "600",
    margin: "0 0 12px",
  },
  note: {
    fontSize: "0.85rem",
    color: "#666",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  token: {
    fontSize: "0.75rem",
    color: "#999",
    marginTop: "12px",
    wordBreak: "break-all",
  },
};
