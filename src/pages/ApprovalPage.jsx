// Customer-facing estimate approval page.
// URL pattern: /approve/:token
// All data access goes through Netlify Functions — no direct Supabase calls.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

/* ── Helpers ── */
const fmtCents = (c) => "$" + ((c ?? 0) / 100).toFixed(2);
const ITEM_TYPE_LABELS = {
  labor: "Labour", part: "Part", shop_supply: "Shop Supply",
  fee: "Fee", discount: "Discount", other: "Other",
};

/* ── Shared inline styles ── */
const S = {
  page:  { minHeight:"100vh", background:"#0b1b3a", display:"flex", flexDirection:"column", fontFamily:"system-ui,-apple-system,sans-serif" },
  header:{ background:"#0b1b3a", borderBottom:"3px solid #b3201d", padding:"16px 24px", display:"flex", alignItems:"center", gap:"12px" },
  logo:  { fontWeight:900, fontSize:"1.3rem", color:"#f5c842", letterSpacing:".5px", margin:0 },
  logoSub: { fontSize:".72rem", color:"rgba(244,236,216,.6)", margin:0 },
  content: { flex:1, padding:"24px 16px", maxWidth:"720px", margin:"0 auto", width:"100%" },
  card:  { background:"#f4ecd8", borderRadius:"12px", padding:"28px 28px", boxShadow:"0 4px 20px rgba(0,0,0,.25)", marginBottom:"20px" },
  heading: { margin:"0 0 4px", fontSize:"1.3rem", fontWeight:800, color:"#0b1b3a" },
  sub:   { margin:"0 0 16px", fontSize:".85rem", color:"#5a6478" },
  divider: { border:"none", borderTop:"1px solid #d9cdb0", margin:"16px 0" },
  label: { fontSize:".7rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".8px", color:"#9aa0ae" },
  value: { fontSize:".92rem", color:"#1a1f2e", fontFamily:"monospace" },
  totalRow: { display:"flex", justifyContent:"space-between", padding:"6px 0", fontSize:".9rem" },
  grandRow: { display:"flex", justifyContent:"space-between", padding:"10px 0 4px", borderTop:"2px solid #d9cdb0", fontWeight:800, fontSize:"1.1rem", color:"#0b1b3a" },
  itemRow: { padding:"14px 0", borderBottom:"1px solid #d9cdb0" },
  decisionRow: { display:"flex", gap:"10px", marginTop:"10px", flexWrap:"wrap" },
  btnApprove: { flex:1, minWidth:"100px", padding:"9px 16px", borderRadius:"6px", border:"2px solid #1a8f5e", background:"#e6f7f1", color:"#1a8f5e", fontWeight:700, cursor:"pointer", fontSize:".85rem", fontFamily:"inherit" },
  btnApproveActive: { flex:1, minWidth:"100px", padding:"9px 16px", borderRadius:"6px", border:"2px solid #1a8f5e", background:"#1a8f5e", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:".85rem", fontFamily:"inherit" },
  btnDecline: { flex:1, minWidth:"100px", padding:"9px 16px", borderRadius:"6px", border:"2px solid #d9cdb0", background:"transparent", color:"#5a6478", fontWeight:700, cursor:"pointer", fontSize:".85rem", fontFamily:"inherit" },
  btnDeclineActive: { flex:1, minWidth:"100px", padding:"9px 16px", borderRadius:"6px", border:"2px solid #b3201d", background:"#fdecea", color:"#b3201d", fontWeight:700, cursor:"pointer", fontSize:".85rem", fontFamily:"inherit" },
  submitBtn: { width:"100%", padding:"14px", borderRadius:"8px", border:"none", background:"#0b1b3a", color:"#f4ecd8", fontWeight:800, fontSize:"1rem", cursor:"pointer", fontFamily:"inherit", letterSpacing:".3px", marginTop:"4px" },
  footer: { background:"rgba(0,0,0,.25)", padding:"16px 24px", textAlign:"center" },
  footerText: { margin:0, fontSize:".75rem", color:"rgba(244,236,216,.45)", lineHeight:1.6 },
};

/* ── Status/message helpers ── */
function StatusMessage({ reason }) {
  const messages = {
    not_found: "This approval link was not found. It may have already expired or been removed.",
    expired:   "This approval link has expired. Please contact P.A.C.E. to request a new one.",
    revoked:   "This approval link has been cancelled. Please contact P.A.C.E. if you have questions.",
    server_error: "We ran into a problem loading your estimate. Please try again or contact P.A.C.E.",
  };
  return (
    <div style={S.card}>
      <h2 style={{ ...S.heading, color:"#b3201d" }}>Link Not Available</h2>
      <p style={{ margin:"8px 0 0", color:"#5a6478", lineHeight:1.6 }}>
        {messages[reason] ?? "This link is no longer valid. Please contact P.A.C.E. for assistance."}
      </p>
      <hr style={S.divider} />
      <p style={{ margin:0, fontSize:".85rem", color:"#5a6478" }}>
        <strong>P.A.C.E. — Power Automotive Centre of Excellence</strong><br/>
        📞 <a href="tel:+14034534554" style={{ color:"#0b1b3a" }}>(403) 453-4554</a> &nbsp;|&nbsp;
        ✉ <a href="mailto:admin@powerautomotive.ca" style={{ color:"#0b1b3a" }}>admin@powerautomotive.ca</a>
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function ApprovalPage() {
  const { token } = useParams();

  const [phase,      setPhase]      = useState("loading"); // loading | ready | already_used | invalid | submitted
  const [errorReason,setErrorReason]= useState(null);
  const [estData,    setEstData]    = useState(null);
  const [decisions,  setDecisions]  = useState({});       // { itemId: 'approved' | 'declined' }
  const [submitting, setSubmitting] = useState(false);
  const [submitError,setSubmitError]= useState("");
  const [result,     setResult]     = useState(null);     // { status, approved_total_cents }

  /* ── Load estimate on mount ── */
  useEffect(() => {
    if (!token) { setPhase("invalid"); setErrorReason("not_found"); return; }
    (async () => {
      try {
        const res = await fetch("/.netlify/functions/get-approval-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!data.valid) {
          setErrorReason(data.reason ?? "not_found");
          setPhase("invalid");
          return;
        }
        setEstData(data);
        // Pre-set required items to approved in decisions
        const init = {};
        for (const item of data.items) {
          if (item.is_required) init[item.id] = "approved";
        }
        setDecisions(init);
        setPhase(data.alreadyUsed ? "already_used" : "ready");
      } catch {
        setErrorReason("server_error");
        setPhase("invalid");
      }
    })();
  }, [token]);

  /* ── Decision toggle ── */
  function toggleDecision(itemId, decision) {
    setDecisions((p) => ({ ...p, [itemId]: decision }));
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault();
    const optionalItems = estData.items.filter((i) => !i.is_required);
    const allDecided = optionalItems.every((i) => decisions[i.id] === "approved" || decisions[i.id] === "declined");
    if (!allDecided) { setSubmitError("Please approve or decline every item before submitting."); return; }

    setSubmitting(true); setSubmitError("");
    try {
      const itemDecisions = estData.items.map((i) => ({
        itemId:   i.id,
        decision: i.is_required ? "approved" : (decisions[i.id] ?? "approved"),
      }));
      const res = await fetch("/.netlify/functions/submit-estimate-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, itemDecisions }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.message || "Submission failed. Please try again."); return; }
      setResult(data);
      setPhase("submitted");
    } catch {
      setSubmitError("Something went wrong. Please contact P.A.C.E. directly.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Layout wrapper ── */
  const PageWrap = ({ children }) => (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <p style={S.logo}>P.A.C.E.</p>
          <p style={S.logoSub}>Power Automotive Centre of Excellence</p>
        </div>
      </header>
      <div style={S.content}>{children}</div>
      <footer style={S.footer}>
        <p style={S.footerText}>
          P.A.C.E. — Power Automotive Centre of Excellence<br/>
          Unit D 8240-31 St SE, Calgary, AB T2C 1H9 &nbsp;|&nbsp; (403) 453-4554 &nbsp;|&nbsp; admin@powerautomotive.ca
        </p>
      </footer>
    </div>
  );

  /* ── Render by phase ── */
  if (phase === "loading") {
    return (
      <PageWrap>
        <div style={{ ...S.card, textAlign:"center", padding:"48px" }}>
          <p style={{ color:"#5a6478", margin:0 }}>Loading your estimate…</p>
        </div>
      </PageWrap>
    );
  }

  if (phase === "invalid") {
    return <PageWrap><StatusMessage reason={errorReason} /></PageWrap>;
  }

  if (phase === "submitted") {
    const statusLabels = { approved:"Approved", partially_approved:"Partially Approved", declined:"Declined" };
    return (
      <PageWrap>
        <div style={S.card}>
          <h2 style={{ ...S.heading, color: result?.status === "declined" ? "#b3201d" : "#1a8f5e" }}>
            {result?.status === "approved" ? "✓ Estimate Approved" :
             result?.status === "declined" ? "Estimate Declined" : "Response Received"}
          </h2>
          <p style={{ margin:"8px 0 0", color:"#5a6478", lineHeight:1.6 }}>
            Thank you — your response has been recorded.
            {result?.status !== "declined" && result?.approved_total_cents > 0 && (
              <> The approved amount is <strong>{fmtCents(result.approved_total_cents)}</strong> (including GST).</>
            )}
          </p>
          <hr style={S.divider} />
          <p style={{ margin:0, fontSize:".85rem", color:"#5a6478", lineHeight:1.6 }}>
            P.A.C.E. will be in touch shortly to confirm next steps. If you have any questions:<br/>
            📞 <a href="tel:+14034534554" style={{ color:"#0b1b3a" }}>(403) 453-4554</a> &nbsp;|&nbsp;
            ✉ <a href="mailto:admin@powerautomotive.ca" style={{ color:"#0b1b3a" }}>admin@powerautomotive.ca</a>
          </p>
        </div>
      </PageWrap>
    );
  }

  if (phase === "already_used") {
    return (
      <PageWrap>
        <div style={S.card}>
          <h2 style={S.heading}>Estimate Already Responded To</h2>
          <p style={{ margin:"8px 0 0", color:"#5a6478", lineHeight:1.6 }}>
            This approval link has already been used. If you need to make changes, please contact P.A.C.E. directly.
          </p>
          <hr style={S.divider} />
          <p style={{ margin:0, fontSize:".85rem", color:"#5a6478" }}>
            📞 <a href="tel:+14034534554" style={{ color:"#0b1b3a" }}>(403) 453-4554</a> &nbsp;|&nbsp;
            ✉ <a href="mailto:admin@powerautomotive.ca" style={{ color:"#0b1b3a" }}>admin@powerautomotive.ca</a>
          </p>
        </div>
      </PageWrap>
    );
  }

  /* ── Ready: show estimate and approval form ── */
  const est = estData.estimate;
  const vehicleStr = estData.vehicle
    ? [estData.vehicle.year, estData.vehicle.make, estData.vehicle.model].filter(Boolean).join(" ")
    : null;

  /* Build job → items map for grouped rendering */
  const hasJobs = estData.jobs?.length > 0;
  const jobItemMap = {};
  if (hasJobs) {
    for (const job of estData.jobs) jobItemMap[job.id] = [];
  }
  const ungroupedApprovalItems = [];
  for (const item of estData.items) {
    if (hasJobs && item.estimate_job_id && jobItemMap[item.estimate_job_id]) {
      jobItemMap[item.estimate_job_id].push(item);
    } else {
      ungroupedApprovalItems.push(item);
    }
  }

  /* Render a single approval item row */
  function ApprovalItemRow({ item }) {
    const dec = decisions[item.id];
    return (
      <div style={S.itemRow}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"12px", flexWrap:"wrap" }}>
          <div style={{ flex:1 }}>
            <p style={{ margin:"0 0 2px", fontWeight:600, color:"#1a1f2e" }}>
              {item.description}
              {item.is_required && (
                <span style={{ marginLeft:8, fontSize:".65rem", fontWeight:700, color:"#b06d00", textTransform:"uppercase", background:"#fff8e6", padding:"2px 6px", borderRadius:8 }}>Required</span>
              )}
            </p>
            <p style={{ margin:0, fontSize:".75rem", color:"#9aa0ae" }}>
              {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} &nbsp;·&nbsp; Qty: {item.quantity}
            </p>
          </div>
          <p style={{ margin:0, fontFamily:"monospace", fontWeight:700, fontSize:"1rem", color:"#0b1b3a", whiteSpace:"nowrap" }}>
            {item.item_type === "discount" ? `-${fmtCents(item.line_total_cents)}` : fmtCents(item.line_total_cents)}
          </p>
        </div>
        {item.is_required ? (
          <p style={{ margin:"8px 0 0", fontSize:".78rem", color:"#1a8f5e", fontWeight:600 }}>
            ✓ Included (required)
          </p>
        ) : (
          <div style={S.decisionRow}>
            <button type="button"
              style={dec === "approved" ? S.btnApproveActive : S.btnApprove}
              onClick={() => toggleDecision(item.id, "approved")}>
              ✓ Approve
            </button>
            <button type="button"
              style={dec === "declined" ? S.btnDeclineActive : S.btnDecline}
              onClick={() => toggleDecision(item.id, "declined")}>
              ✕ Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <PageWrap>
      {/* Estimate header */}
      <div style={S.card}>
        <h1 style={S.heading}>Estimate Review</h1>
        <p style={S.sub}>Please review the work and approve or decline each item below.</p>
        {est.customer_message && (
          <div style={{ background:"rgba(11,27,58,.07)", borderLeft:"3px solid #b3201d", padding:"10px 14px", borderRadius:"4px", marginBottom:"12px", fontSize:".88rem", color:"#333", lineHeight:1.6 }}>
            {est.customer_message}
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:"12px" }}>
          {est.estimate_number && (
            <div>
              <p style={S.label}>Estimate #</p>
              <p style={S.value}>{est.estimate_number}</p>
            </div>
          )}
          {estData.ro_number && (
            <div>
              <p style={S.label}>Repair Order</p>
              <p style={S.value}>{estData.ro_number}</p>
            </div>
          )}
          {vehicleStr && (
            <div>
              <p style={S.label}>Vehicle</p>
              <p style={{ ...S.value, fontFamily:"inherit" }}>{vehicleStr}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items — grouped or flat depending on whether jobs exist */}
      <form onSubmit={handleSubmit} noValidate>
        {hasJobs ? (
          /* Grouped mode: one card per job, ungrouped items at end */
          <>
            {estData.jobs.map((job) => {
              const jobItems = jobItemMap[job.id] ?? [];
              if (!jobItems.length) return null;
              return (
                <div key={job.id} style={S.card}>
                  <h2 style={{ margin:"0 0 12px", fontSize:"1rem", fontWeight:700, color:"#0b1b3a", borderBottom:"1px solid #d9cdb0", paddingBottom:"8px" }}>
                    {job.title}
                  </h2>
                  <p style={{ margin:"-8px 0 14px", fontSize:".78rem", color:"#9aa0ae" }}>
                    Approve or decline each optional item. Required items are pre-approved.
                  </p>
                  {jobItems.map((item) => <ApprovalItemRow key={item.id} item={item} />)}
                </div>
              );
            })}
            {ungroupedApprovalItems.length > 0 && (
              <div style={S.card}>
                <h2 style={{ margin:"0 0 4px", fontSize:"1rem", fontWeight:700, color:"#0b1b3a" }}>Other Items</h2>
                <p style={{ margin:"0 0 16px", fontSize:".82rem", color:"#5a6478" }}>
                  Approve or decline each optional item. Required items are pre-approved.
                </p>
                {ungroupedApprovalItems.map((item) => <ApprovalItemRow key={item.id} item={item} />)}
              </div>
            )}
          </>
        ) : (
          /* Flat mode: single card with all items */
          <div style={S.card}>
            <h2 style={{ margin:"0 0 4px", fontSize:"1rem", fontWeight:700, color:"#0b1b3a" }}>Work Items</h2>
            <p style={{ margin:"0 0 16px", fontSize:".82rem", color:"#5a6478" }}>
              Approve or decline each optional item. Required items are pre-approved.
            </p>
            {estData.items.map((item) => <ApprovalItemRow key={item.id} item={item} />)}
          </div>
        )}

        {/* Totals */}
        <div style={S.card}>
          <div style={S.totalRow}><span>Subtotal</span><span style={{ fontFamily:"monospace" }}>{fmtCents(est.subtotal_cents)}</span></div>
          <div style={S.totalRow}><span>GST (5%)</span><span style={{ fontFamily:"monospace" }}>{fmtCents(est.tax_cents)}</span></div>
          <div style={S.grandRow}><span>Total</span><span style={{ fontFamily:"monospace" }}>{fmtCents(est.total_cents)}</span></div>
        </div>

        {/* Submit */}
        <div style={S.card}>
          {submitError && (
            <div style={{ padding:"10px 14px", background:"#fdecea", border:"1px solid #f4c0bc", borderRadius:"6px", color:"#b3201d", fontSize:".85rem", marginBottom:"14px" }}>
              {submitError}
            </div>
          )}
          <button type="submit" style={{ ...S.submitBtn, opacity: submitting ? .6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
            disabled={submitting}>
            {submitting ? "Submitting…" : "Submit My Response"}
          </button>
          <p style={{ margin:"10px 0 0", fontSize:".75rem", color:"#9aa0ae", textAlign:"center", lineHeight:1.5 }}>
            By submitting, you authorize P.A.C.E. to proceed with the approved work.
            No payment is collected here.
          </p>
        </div>
      </form>
    </PageWrap>
  );
}
