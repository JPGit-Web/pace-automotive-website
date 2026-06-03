import PortalLayout from "../../components/portal/PortalLayout";

/* ── Placeholder data — replace with real Supabase queries in Phase 3+ ── */
const mockActivity = [
  { ro: "RO-2024-007", customer: "Sarah M.",   vehicle: "2019 Toyota Camry",   status: "active",    updated: "Today, 9:14 AM" },
  { ro: "RO-2024-006", customer: "James K.",   vehicle: "2021 Ford F-150",     status: "waiting",   updated: "Today, 8:32 AM" },
  { ro: "RO-2024-005", customer: "Priya S.",   vehicle: "2017 Honda Civic",    status: "approved",  updated: "Yesterday" },
  { ro: "RO-2024-004", customer: "Daniel W.",  vehicle: "2015 Subaru Outback", status: "completed", updated: "Yesterday" },
  { ro: "RO-2024-003", customer: "Lisa T.",    vehicle: "2020 Hyundai Elantra",status: "completed", updated: "Jun 1" },
];

const statusRows = [
  { label: "Draft",            count: 2,  pct: 10, color: "gray" },
  { label: "Active",           count: 5,  pct: 25, color: "" },
  { label: "Awaiting Approval",count: 2,  pct: 10, color: "yellow" },
  { label: "In Progress",      count: 5,  pct: 25, color: "" },
  { label: "Completed",        count: 8,  pct: 40, color: "green" },
];

const quickActions = [
  { label: "New Repair Order", icon: "fa-solid fa-plus",      disabled: true,  note: "Phase 6" },
  { label: "New Customer",     icon: "fa-solid fa-user-plus", disabled: true,  note: "Phase 4" },
  { label: "View Appointments",icon: "fa-solid fa-calendar",  disabled: false, href: "/portal/appointments" },
];

export default function PortalDashboard() {
  return (
    <PortalLayout title="Dashboard">

      {/* Dashboard status banner */}
      <div className="portalDemoBanner">
        <i className="fa-solid fa-circle-info"></i>
        <span>
          <strong>Dashboard preview</strong> — some dashboard metrics are placeholder data. Live reporting will be connected in a later phase.
        </span>
      </div>

      {/* Stat cards */}
      <div className="portalStatGrid">
        <div className="portalStatCard navy">
          <span className="portalStatLabel">Today's Appointments</span>
          <span className="portalStatValue">—</span>
          <span className="portalStatSub">Preview data</span>
        </div>
        <div className="portalStatCard yellow">
          <span className="portalStatLabel">Open Repair Orders</span>
          <span className="portalStatValue">—</span>
          <span className="portalStatSub">Preview data</span>
        </div>
        <div className="portalStatCard red">
          <span className="portalStatLabel">Awaiting Approval</span>
          <span className="portalStatValue">—</span>
          <span className="portalStatSub">Preview data</span>
        </div>
        <div className="portalStatCard green">
          <span className="portalStatLabel">Unpaid Invoices</span>
          <span className="portalStatValue">—</span>
          <span className="portalStatSub">Preview data</span>
        </div>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="portalTwoCol" style={{ gridTemplateColumns: "2fr 1fr" }}>

        {/* Recent activity */}
        <div className="portalCard">
          <p className="portalCardTitle">Recent Activity</p>
          <table className="portalTable">
            <thead>
              <tr>
                <th>RO #</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {mockActivity.map((row) => (
                <tr key={row.ro}>
                  <td style={{ fontWeight: 700, color: "var(--p-navy)" }}>{row.ro}</td>
                  <td>{row.customer}</td>
                  <td style={{ color: "var(--p-text-2)", fontSize: ".83rem" }}>{row.vehicle}</td>
                  <td><span className={`portalBadge ${row.status}`}>{row.status}</span></td>
                  <td style={{ color: "var(--p-text-3)", fontSize: ".8rem" }}>{row.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick Actions */}
        <div className="portalCard">
          <p className="portalCardTitle">Quick Actions</p>
          <div className="portalQuickActions">
            {quickActions.map((a) => (
              <button
                key={a.label}
                className="portalQuickAction"
                disabled={a.disabled}
                onClick={!a.disabled && a.href ? () => window.location.href = a.href : undefined}
                title={a.disabled ? `Coming in ${a.note}` : ""}
              >
                <span className="portalQuickActionIcon">
                  <i className={a.icon}></i>
                </span>
                <span>{a.label}</span>
                {a.disabled && (
                  <span style={{ marginLeft: "auto", fontSize: ".72rem", color: "var(--p-text-3)" }}>
                    {a.note}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Work Order Pipeline */}
      <div className="portalCard" style={{ marginBottom: 0 }}>
        <p className="portalCardTitle">Work Order Pipeline</p>
        <div className="portalStatusBar">
          {statusRows.map((r) => (
            <div className="portalStatusRow" key={r.label}>
              <span className="portalStatusRowLabel">{r.label}</span>
              <div className="portalStatusRowTrack">
                <div
                  className={`portalStatusRowFill ${r.color}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
              <span className="portalStatusRowCount">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

    </PortalLayout>
  );
}
