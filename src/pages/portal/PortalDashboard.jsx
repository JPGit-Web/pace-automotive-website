import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import { fetchDashboardData } from "../../lib/portalData";

/* ── Helpers ─────────────────────────────────────────────── */
const fmtCents = (c) => c != null ? "$" + (c / 100).toFixed(2) : "—";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateOnly(dateStr) {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

function fmtAction(action) {
  return action?.replace(/\./g, " › ").replace(/_/g, " ") ?? action;
}

const fullName = (c) => c ? `${c.first_name} ${c.last_name}` : "—";
const vLabel   = (v) => v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "—";

const PIPELINE_ORDER = ["draft","active","in_progress","waiting_approval","approved","completed","invoiced","closed"];
const PIPELINE_LABELS = {
  draft: "Draft", active: "Active", in_progress: "In Progress",
  waiting_approval: "Waiting Approval", approved: "Approved",
  completed: "Completed", invoiced: "Invoiced", closed: "Closed",
};
const PIPELINE_COLORS = {
  draft: "gray", active: "", in_progress: "", waiting_approval: "yellow",
  approved: "green", completed: "green", invoiced: "", closed: "gray",
};

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d) < today;
};

/* ── Sub-components ─────────────────────────────────────── */
function KpiCard({ color, label, value, sub, onClick, loading }) {
  return (
    <div className={`portalStatCard ${color}`}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}>
      <span className="portalStatLabel">{label}</span>
      <span className="portalStatValue">{loading ? "…" : value}</span>
      {sub && <span className="portalStatSub">{sub}</span>}
    </div>
  );
}

function AttentionRow({ icon, title, count, items, renderItem, emptyMsg, onViewAll, viewLabel = "View all" }) {
  if (count === 0 && !items?.length) return null;
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: ".82rem", textTransform: "uppercase", letterSpacing: ".8px", color: "var(--p-text-2)", display: "flex", alignItems: "center", gap: "8px" }}>
          <i className={icon} style={{ color: "var(--p-danger)" }}></i>
          {title}
          {(count > 0 || items?.length > 0) && (
            <span className="portalCountBadge">{count || items?.length}</span>
          )}
        </p>
        {onViewAll && (
          <button className="portalBtn portalBtnSecondary" style={{ padding: "4px 12px", fontSize: ".75rem" }} onClick={onViewAll}>
            {viewLabel}
          </button>
        )}
      </div>
      {items?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map(renderItem)}
        </div>
      ) : emptyMsg ? (
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--p-text-3)" }}>{emptyMsg}</p>
      ) : null}
    </div>
  );
}

/* ============================================================ */
export default function PortalDashboard() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchDashboardData()); }
    catch (e) {
      if (import.meta.env.DEV) console.error("[Dashboard] load failed:", e);
      setError("Failed to load dashboard data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Pipeline bar */
  const pipelineTotal = PIPELINE_ORDER.reduce(
    (sum, s) => sum + (data?.pipelineCounts?.[s] ?? 0), 0
  );

  /* Attention total */
  const attentionCount =
    (data?.pendingApptsCount   ?? 0) +
    (data?.sentEstimatesCount  ?? 0) +
    (data?.unpaidInvoicesCount ?? 0) +
    (data?.overdueROs?.length  ?? 0) +
    (data?.syncErrors?.length  ?? 0);

  return (
    <PortalLayout title="Dashboard">

      {/* Header row */}
      <div className="portalPageHeader" style={{ marginBottom: "20px" }}>
        <div>
          <h2 className="portalPageHeading">Shop Command Centre</h2>
          <p className="portalPageDesc">Live overview of P.A.C.E. shop activity.</p>
        </div>
        <button className="portalBtn portalBtnSecondary" onClick={load} disabled={loading}
          style={{ fontSize: ".82rem" }}>
          <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`}></i>
          {loading ? " Loading…" : " Refresh"}
        </button>
      </div>

      {error && (
        <div className="portalDemoBanner" style={{ marginBottom: "16px", background: "var(--p-danger-bg)", borderColor: "#f4c0bc", color: "var(--p-danger)" }}>
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>{error}</span>
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* ── KPI Cards (6) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <KpiCard color="navy"   loading={loading}
          label="Pending Appointments"
          value={data?.pendingApptsCount ?? "—"}
          sub="awaiting confirmation"
          onClick={() => navigate("/portal/appointments")} />
        <KpiCard color="yellow" loading={loading}
          label="Active Repair Orders"
          value={data?.activeROsCount ?? "—"}
          sub="in shop"
          onClick={() => navigate("/portal/repair-orders")} />
        <KpiCard color=""       loading={loading}
          label="Inspections In Progress"
          value={data?.inProgressInspectionsCount ?? "—"}
          sub="not yet completed"
          onClick={() => navigate("/portal/inspections")} />
        <KpiCard color="red"    loading={loading}
          label="Estimates Awaiting Approval"
          value={data?.sentEstimatesCount ?? "—"}
          sub="sent to customer"
          onClick={() => navigate("/portal/estimates")} />
        <KpiCard color="green"  loading={loading}
          label="Approved Estimates"
          value={data?.approvedEstimatesCount ?? "—"}
          sub="may need invoice"
          onClick={() => navigate("/portal/estimates")} />
        <KpiCard color="red"    loading={loading}
          label="Unpaid / Partial Invoices"
          value={data?.unpaidInvoicesCount ?? "—"}
          sub="payment outstanding"
          onClick={() => navigate("/portal/invoices")} />
      </div>

      {/* ── Main content row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "20px", marginBottom: "20px" }}>

        {/* ── Attention needed ── */}
        <div className="portalCard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p className="portalCardTitle" style={{ margin: 0 }}>
              Needs Attention
              {attentionCount > 0 && (
                <span className="portalCountBadge" style={{ marginLeft: 8, background: "var(--p-danger-bg)", color: "var(--p-danger)", borderColor: "#f4c0bc" }}>{attentionCount}</span>
              )}
            </p>
          </div>

          {loading ? (
            <p style={{ color: "var(--p-text-3)", fontSize: ".88rem" }}>Loading…</p>
          ) : attentionCount === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <i className="fa-solid fa-circle-check" style={{ fontSize: "1.8rem", color: "var(--p-success)", marginBottom: "8px", display: "block" }}></i>
              <p style={{ margin: 0, color: "var(--p-text-2)", fontSize: ".88rem" }}>Nothing needs attention right now.</p>
            </div>
          ) : (
            <>
              {/* Pending appointments */}
              {(data?.pendingApptsCount ?? 0) > 0 && (
                <AttentionRow
                  icon="fa-solid fa-calendar-xmark"
                  title="Pending Appointment Requests"
                  count={data.pendingApptsCount}
                  items={[]}
                  onViewAll={() => navigate("/portal/appointments")}
                  viewLabel="View requests"
                />
              )}

              {/* Overdue promised ROs */}
              <AttentionRow
                icon="fa-solid fa-clock"
                title="Overdue / Due Today"
                count={data?.overdueROs?.length ?? 0}
                items={data?.overdueROs ?? []}
                renderItem={(ro) => (
                  <div key={ro.id}
                    style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--p-bg)", borderRadius: "var(--p-radius-sm)", cursor: "pointer", border: "1px solid var(--p-border)" }}
                    onClick={() => navigate("/portal/repair-orders")}>
                    <span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--p-navy)", fontSize: ".85rem" }}>{ro.ro_number}</span>
                      <span style={{ marginLeft: 8, fontSize: ".82rem", color: "var(--p-text-2)" }}>{fullName(ro.customers)}</span>
                    </span>
                    <span style={{ fontSize: ".75rem", color: isOverdue(ro.promised_date) ? "var(--p-danger)" : "var(--p-warning)", fontWeight: 700 }}>
                      {isOverdue(ro.promised_date) ? "OVERDUE" : "Due today"} · {fmtDateOnly(ro.promised_date)}
                    </span>
                  </div>
                )}
                onViewAll={() => navigate("/portal/repair-orders")}
              />

              {/* Sent estimates */}
              <AttentionRow
                icon="fa-solid fa-paper-plane"
                title="Sent Estimates — Awaiting Customer Response"
                count={data?.sentEstimatesCount ?? 0}
                items={data?.sentEstimates ?? []}
                renderItem={(est) => (
                  <div key={est.id}
                    style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--p-bg)", borderRadius: "var(--p-radius-sm)", cursor: "pointer", border: "1px solid var(--p-border)" }}
                    onClick={() => navigate("/portal/estimates")}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--p-navy)", fontSize: ".85rem" }}>{est.estimate_number}</span>
                    <span style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: ".82rem", color: "var(--p-text-2)" }}>{fmtCents(est.total_cents)}</span>
                      <span style={{ fontSize: ".75rem", color: "var(--p-text-3)" }}>Sent {fmtDate(est.sent_at)}</span>
                    </span>
                  </div>
                )}
                onViewAll={() => navigate("/portal/estimates")}
              />

              {/* Unpaid invoices */}
              <AttentionRow
                icon="fa-solid fa-receipt"
                title="Invoices Awaiting Payment"
                count={data?.unpaidInvoicesCount ?? 0}
                items={data?.unpaidInvoices ?? []}
                renderItem={(inv) => (
                  <div key={inv.id}
                    style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--p-bg)", borderRadius: "var(--p-radius-sm)", cursor: "pointer", border: "1px solid var(--p-border)" }}
                    onClick={() => navigate("/portal/invoices")}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--p-navy)", fontSize: ".85rem" }}>
                      {inv.helcim_invoice_number || inv.repair_orders?.ro_number || "(no #)"}
                    </span>
                    <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span className={`portalBadge ${inv.payment_status}`} style={{ fontSize: ".7rem" }}>{inv.payment_status}</span>
                      <span style={{ fontFamily: "monospace", fontSize: ".82rem", color: "var(--p-danger)", fontWeight: 600 }}>Due {fmtCents(inv.amount_due_cents)}</span>
                    </span>
                  </div>
                )}
                onViewAll={() => navigate("/portal/invoices")}
              />

              {/* Sync errors */}
              {(data?.syncErrors?.length ?? 0) > 0 && (
                <AttentionRow
                  icon="fa-solid fa-triangle-exclamation"
                  title="Helcim Sync Errors"
                  count={data.syncErrors.length}
                  items={data.syncErrors}
                  renderItem={(inv) => (
                    <div key={inv.id} style={{ padding: "8px 10px", background: "var(--p-danger-bg)", borderRadius: "var(--p-radius-sm)", border: "1px solid #f4c0bc", cursor: "pointer" }}
                      onClick={() => navigate("/portal/invoices")}>
                      <span style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--p-danger)" }}>
                        {inv.helcim_invoice_number || inv.repair_orders?.ro_number}:
                      </span>
                      <span style={{ marginLeft: 8, fontSize: ".78rem", color: "var(--p-danger)" }}>{inv.sync_error}</span>
                    </div>
                  )}
                  onViewAll={() => navigate("/portal/invoices")}
                />
              )}
            </>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="portalCard">
          <p className="portalCardTitle">Quick Actions</p>
          <div className="portalQuickActions">
            {[
              { label: "Appointments",  icon: "fa-solid fa-calendar-days", href: "/portal/appointments" },
              { label: "Repair Orders", icon: "fa-solid fa-screwdriver-wrench", href: "/portal/repair-orders" },
              { label: "Customers",     icon: "fa-solid fa-users",          href: "/portal/customers" },
              { label: "Inspections",   icon: "fa-solid fa-clipboard-check",href: "/portal/inspections" },
              { label: "Estimates",     icon: "fa-solid fa-file-invoice-dollar", href: "/portal/estimates" },
              { label: "Invoices",      icon: "fa-solid fa-receipt",         href: "/portal/invoices" },
            ].map((a) => (
              <button key={a.label} className="portalQuickAction" onClick={() => navigate(a.href)}>
                <span className="portalQuickActionIcon"><i className={a.icon}></i></span>
                <span>{a.label}</span>
                <i className="fa-solid fa-chevron-right" style={{ marginLeft: "auto", fontSize: ".65rem", color: "var(--p-text-3)" }}></i>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active ROs + Recent Activity row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>

        {/* Active repair orders */}
        <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--p-border)" }}>
            <p className="portalCardTitle" style={{ margin: 0 }}>Active Repair Orders</p>
          </div>
          {loading ? (
            <div className="portalEmptyState" style={{ padding: "24px" }}>
              <p style={{ color: "var(--p-text-3)", margin: 0 }}>Loading…</p>
            </div>
          ) : (data?.activeROs?.length ?? 0) === 0 ? (
            <div className="portalEmptyState" style={{ padding: "24px" }}>
              <p style={{ color: "var(--p-text-3)", margin: 0 }}>No active repair orders.</p>
            </div>
          ) : (
            <table className="portalTable">
              <thead>
                <tr><th>RO #</th><th>Customer</th><th>Status</th><th>Promised</th></tr>
              </thead>
              <tbody>
                {(data?.activeROs ?? []).map((ro) => (
                  <tr key={ro.id} style={{ cursor: "pointer" }} onClick={() => navigate("/portal/repair-orders")}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--p-navy)", fontSize: ".85rem" }}>{ro.ro_number}</td>
                    <td style={{ fontSize: ".85rem" }}>{fullName(ro.customers)}</td>
                    <td><span className={`portalBadge ${ro.status?.replace(/_/g, "-")}`} style={{ fontSize: ".7rem" }}>{ro.status?.replace(/_/g, " ")}</span></td>
                    <td style={{ fontSize: ".78rem", color: isOverdue(ro.promised_date) ? "var(--p-danger)" : "var(--p-text-3)", fontWeight: isOverdue(ro.promised_date) ? 700 : 400 }}>
                      {ro.promised_date ? fmtDateOnly(ro.promised_date) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent activity */}
        <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--p-border)" }}>
            <p className="portalCardTitle" style={{ margin: 0 }}>Recent Activity</p>
          </div>
          {loading ? (
            <div className="portalEmptyState" style={{ padding: "24px" }}>
              <p style={{ color: "var(--p-text-3)", margin: 0 }}>Loading…</p>
            </div>
          ) : (data?.recentActivity?.length ?? 0) === 0 ? (
            <div className="portalEmptyState" style={{ padding: "24px" }}>
              <p style={{ color: "var(--p-text-3)", margin: 0 }}>No recent activity logged.</p>
            </div>
          ) : (
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {(data?.recentActivity ?? []).map((log) => (
                <div key={log.id} style={{ display: "flex", gap: "10px", padding: "10px 16px", borderBottom: "1px solid var(--p-border)", alignItems: "flex-start" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--p-bg)", border: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", color: "var(--p-text-3)", flexShrink: 0 }}>
                    <i className="fa-solid fa-bolt"></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontSize: ".82rem", fontWeight: 600, color: "var(--p-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {fmtAction(log.action)}
                    </p>
                    <p style={{ margin: 0, fontSize: ".72rem", color: "var(--p-text-3)" }}>
                      {log.entity_type} · {fmtDate(log.created_at)} {fmtTime(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Work Order Pipeline ── */}
      <div className="portalCard">
        <p className="portalCardTitle">Work Order Pipeline</p>
        {loading ? (
          <p style={{ color: "var(--p-text-3)", fontSize: ".88rem" }}>Loading…</p>
        ) : (
          <div className="portalStatusBar">
            {PIPELINE_ORDER.map((s) => {
              const count = data?.pipelineCounts?.[s] ?? 0;
              const pct   = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0;
              return (
                <div className="portalStatusRow" key={s}>
                  <span className="portalStatusRowLabel">{PIPELINE_LABELS[s]}</span>
                  <div className="portalStatusRowTrack">
                    <div className={`portalStatusRowFill ${PIPELINE_COLORS[s]}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="portalStatusRowCount">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </PortalLayout>
  );
}
