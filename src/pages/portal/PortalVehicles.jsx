import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import { listVehicles, getVehicleServiceHistory } from "../../lib/portalData";

const vehicleLabel = (v) => [v.year, v.make, v.model].filter(Boolean).join(" ");

const RO_STATUS_LABELS = {
  draft:            "Draft",
  active:           "Active",
  waiting_approval: "Waiting Approval",
  approved:         "Approved",
  in_progress:      "In Progress",
  completed:        "Completed",
  invoiced:         "Invoiced",
  closed:           "Closed",
  cancelled:        "Cancelled",
};
const PAYMENT_LABELS = { unpaid: "Unpaid", partial: "Partial", paid: "Paid" };
const INSP_STATUS_LABELS = {
  draft:            "Draft",
  in_progress:      "In Progress",
  completed:        "Completed",
  sent_to_customer: "Sent to Customer",
};
const EST_STATUS_LABELS = {
  draft:              "Draft",
  sent:               "Sent",
  approved:           "Approved",
  partially_approved: "Partially Approved",
  declined:           "Declined",
  expired:            "Expired",
  cancelled:          "Cancelled",
};

const fmtDate    = (iso) => iso ? new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" }) : "—";
const fmtCents   = (c)   => c != null ? `$${(c / 100).toFixed(2)}` : null;
const statusCls  = (s)   => s?.replace(/_/g, "-") ?? "";

export default function PortalVehicles() {
  const navigate = useNavigate();

  const [vehicles,        setVehicles]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [search,          setSearch]          = useState("");
  const [selected,        setSelected]        = useState(null);
  const [vehHistory,      setVehHistory]      = useState(null);
  const [vehHistLoading,  setVehHistLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVehicles(await listVehicles());
    } catch {
      setError("Failed to load vehicles. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Load vehicle history whenever selection changes */
  useEffect(() => {
    if (!selected) { setVehHistory(null); return; }
    let cancelled = false;
    setVehHistLoading(true);
    setVehHistory(null);
    getVehicleServiceHistory(selected.id)
      .then((h) => { if (!cancelled) setVehHistory(h); })
      .catch(() => { if (!cancelled) setVehHistory({ error: true }); })
      .finally(() => { if (!cancelled) setVehHistLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  /* ── Client-side search ── */
  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    const customerName = v.customers
      ? `${v.customers.first_name} ${v.customers.last_name}`.toLowerCase()
      : "";
    return (
      v.make?.toLowerCase().includes(t) ||
      v.model?.toLowerCase().includes(t) ||
      v.vin?.toLowerCase().includes(t) ||
      v.license_plate?.toLowerCase().includes(t) ||
      customerName.includes(t) ||
      v.year?.toString().includes(t)
    );
  });

  return (
    <PortalLayout title="Vehicles">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Vehicles</h2>
          <p className="portalPageDesc">
            All active vehicles on file. To add or edit a vehicle, open the customer record.
          </p>
        </div>
      </div>

      <div className="portalToolbar">
        <div className="portalSearchBar">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            className="portalSearchInput"
            placeholder="Search by make, model, VIN, plate, or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtered.length > 0 && (
          <span style={{ fontSize: ".82rem", color: "var(--p-text-3)" }}>
            {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Vehicle list */}
      <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="portalEmptyState">
            <p style={{ color: "var(--p-text-3)" }}>Loading vehicles…</p>
          </div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load vehicles</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={load}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-car" style={{ opacity: .25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search ? "No vehicles match your search" : "No vehicles on file yet"}
            </p>
            <p className="portalEmptyDesc">
              {search
                ? "Try a different make, model, VIN, plate, or customer name."
                : "Vehicles are added from a customer record. Open a customer to add their vehicle."}
            </p>
          </div>
        ) : (
          <>
            <table className="portalTable">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Customer</th>
                  <th>License Plate</th>
                  <th>VIN</th>
                  <th>Color</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setSelected(selected?.id === v.id ? null : v)}
                    style={{ cursor: "pointer", background: selected?.id === v.id ? "rgba(11,27,58,.04)" : undefined }}
                  >
                    <td style={{ fontWeight: 700, color: "var(--p-navy)" }}>
                      {vehicleLabel(v)}
                      {v.trim && <span style={{ fontWeight: 400, color: "var(--p-text-2)", marginLeft: 6, fontSize: ".83rem" }}>{v.trim}</span>}
                    </td>
                    <td style={{ color: "var(--p-text-2)", fontSize: ".88rem" }}>
                      {v.customers
                        ? `${v.customers.first_name} ${v.customers.last_name}`
                        : <span style={{ color: "var(--p-text-3)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--p-text-2)", fontSize: ".88rem" }}>
                      {v.license_plate
                        ? `${v.license_plate}${v.plate_province ? ` (${v.plate_province})` : ""}`
                        : <span style={{ color: "var(--p-text-3)" }}>—</span>}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: ".83rem", color: "var(--p-text-2)" }}>
                      {v.vin || <span style={{ color: "var(--p-text-3)", fontFamily: "inherit" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--p-text-2)", fontSize: ".88rem" }}>
                      {v.color || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Expanded vehicle detail + history panel */}
            {selected && (
              <div className="portalVehDetailPanel">
                {/* Panel header */}
                <div className="portalVehDetailHeader">
                  <div>
                    <strong style={{ fontSize: "1rem", color: "var(--p-text)" }}>{vehicleLabel(selected)}</strong>
                    {selected.customers && (
                      <span style={{ marginLeft: 10, fontSize: ".83rem", color: "var(--p-text-2)" }}>
                        — {selected.customers.first_name} {selected.customers.last_name}
                      </span>
                    )}
                  </div>
                  <button
                    className="portalVehDetailClose"
                    onClick={() => setSelected(null)}
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Vehicle fields */}
                <div className="portalVehDetailGrid">
                  {[
                    ["Trim",          selected.trim],
                    ["Color",         selected.color],
                    ["License Plate", selected.license_plate],
                    ["Province",      selected.plate_province],
                    ["VIN",           selected.vin],
                  ].map(([label, val]) => val ? (
                    <div key={label}>
                      <div className="portalDetailLabel">{label}</div>
                      <div className="portalDetailValue" style={{ fontFamily: label === "VIN" ? "monospace" : "inherit" }}>{val}</div>
                    </div>
                  ) : null)}
                  {selected.notes && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div className="portalDetailLabel">Notes</div>
                      <div className="portalDetailValue" style={{ whiteSpace: "pre-wrap" }}>{selected.notes}</div>
                    </div>
                  )}
                </div>

                <p style={{ margin: "10px 0 16px", fontSize: ".75rem", color: "var(--p-text-3)" }}>
                  To edit or remove this vehicle, open the customer record.
                </p>

                {/* Service History */}
                <div style={{ borderTop: "1px solid var(--p-border)", paddingTop: "16px" }}>
                  <p className="portalSectionTitle" style={{ marginBottom: "12px" }}>
                    <span>
                      Service History
                      {vehHistory?.repairOrders?.length > 0 && (
                        <span className="portalCountBadge" style={{ marginLeft: 8 }}>
                          {vehHistory.repairOrders.length}
                        </span>
                      )}
                    </span>
                  </p>

                  {vehHistLoading ? (
                    <p style={{ color: "var(--p-text-3)", fontSize: ".85rem" }}>Loading service history…</p>
                  ) : !vehHistory || vehHistory.error ? (
                    <p style={{ color: "var(--p-text-3)", fontSize: ".85rem" }}>Could not load service history.</p>
                  ) : vehHistory.repairOrders.length === 0 ? (
                    <div className="portalHistoryEmpty">
                      <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: "1.2rem", opacity: .25, display: "block", marginBottom: 6 }}></i>
                      No service history yet for this vehicle.
                    </div>
                  ) : (
                    <div className="portalHistoryList">
                      {vehHistory.repairOrders.map((ro) => {
                        const concerns   = vehHistory.concerns.filter((c) => c.repair_order_id === ro.id);
                        const inspection = vehHistory.inspections.find((i) => i.repair_order_id === ro.id);
                        const estimate   = vehHistory.estimates.find((e) => e.repair_order_id === ro.id);
                        const invoice    = vehHistory.invoices.find((i) => i.repair_order_id === ro.id);
                        const isClosed   = ro.status === "closed" || ro.status === "cancelled";

                        return (
                          <div key={ro.id} className={`portalHistoryRow${isClosed ? " closed" : ""}`}>
                            <div className="portalHistoryRowHeader">
                              <span className="portalHistoryRONum">{ro.ro_number}</span>
                              <span className="portalHistoryDate">{fmtDate(ro.created_at)}</span>
                              <span className={`portalBadge ${statusCls(ro.status)}`} style={{ fontSize: ".68rem" }}>
                                {RO_STATUS_LABELS[ro.status] ?? ro.status}
                              </span>
                              <span className={`portalBadge ${ro.payment_status}`} style={{ fontSize: ".68rem" }}>
                                {PAYMENT_LABELS[ro.payment_status] ?? ro.payment_status}
                              </span>
                              <div style={{ flex: 1 }} />
                              <button
                                className="portalHistoryLinkBtn"
                                onClick={() => navigate("/portal/repair-orders")}
                                title="Go to Repair Orders"
                              >
                                ROs <i className="fa-solid fa-arrow-right" style={{ fontSize: ".65rem" }}></i>
                              </button>
                            </div>

                            {ro.mileage_in != null && (
                              <div className="portalHistoryVehicle">
                                <i className="fa-solid fa-gauge-high" style={{ opacity: .45, fontSize: ".78rem" }}></i>
                                {ro.mileage_in.toLocaleString()} km in
                                {ro.mileage_out != null && ` / ${ro.mileage_out.toLocaleString()} km out`}
                              </div>
                            )}

                            {(concerns.length > 0 || inspection || estimate || invoice) && (
                              <div className="portalHistoryDetails">
                                {concerns.length > 0 && (
                                  <div className="portalHistoryDetailItem">
                                    <span className="portalHistoryDetailLabel">Concerns</span>
                                    <span className="portalHistoryDetailValue">
                                      {concerns.map((c) => c.concern_text).join(" · ")}
                                    </span>
                                  </div>
                                )}
                                {inspection && (
                                  <div className="portalHistoryDetailItem">
                                    <span className="portalHistoryDetailLabel">Inspection</span>
                                    <span className={`portalBadge ${statusCls(inspection.status)}`} style={{ fontSize: ".65rem" }}>
                                      {INSP_STATUS_LABELS[inspection.status] ?? inspection.status?.replace(/_/g, " ") ?? "—"}
                                    </span>
                                    <button
                                      className="portalHistoryLinkBtn"
                                      onClick={() => navigate("/portal/inspections", { state: { inspectionId: inspection.id } })}
                                    >
                                      View
                                    </button>
                                  </div>
                                )}
                                {estimate && (
                                  <div className="portalHistoryDetailItem">
                                    <span className="portalHistoryDetailLabel">Estimate</span>
                                    {estimate.estimate_number && (
                                      <span style={{ fontFamily: "monospace", fontSize: ".8rem", color: "var(--p-text-2)" }}>
                                        {estimate.estimate_number}
                                      </span>
                                    )}
                                    <span className={`portalBadge ${statusCls(estimate.status)}`} style={{ fontSize: ".65rem" }}>
                                      {EST_STATUS_LABELS[estimate.status] ?? estimate.status}
                                    </span>
                                    {estimate.total_cents != null && (
                                      <span style={{ fontSize: ".82rem", color: "var(--p-text-2)" }}>
                                        {fmtCents(estimate.total_cents)}
                                      </span>
                                    )}
                                    <button
                                      className="portalHistoryLinkBtn"
                                      onClick={() => navigate("/portal/estimates", { state: { estimateId: estimate.id } })}
                                    >
                                      View
                                    </button>
                                  </div>
                                )}
                                {invoice && (
                                  <div className="portalHistoryDetailItem">
                                    <span className="portalHistoryDetailLabel">Invoice</span>
                                    {invoice.helcim_invoice_number && (
                                      <span style={{ fontFamily: "monospace", fontSize: ".8rem", color: "var(--p-text-2)" }}>
                                        {invoice.helcim_invoice_number}
                                      </span>
                                    )}
                                    <span className={`portalBadge ${invoice.payment_status}`} style={{ fontSize: ".65rem" }}>
                                      {PAYMENT_LABELS[invoice.payment_status] ?? invoice.payment_status}
                                    </span>
                                    {invoice.payment_status !== "paid" && invoice.amount_due_cents != null && (
                                      <span style={{ fontSize: ".82rem", color: "var(--p-danger)" }}>
                                        {fmtCents(invoice.amount_due_cents)} due
                                      </span>
                                    )}
                                    {invoice.payment_status === "paid" && invoice.total_cents != null && (
                                      <span style={{ fontSize: ".82rem", color: "var(--p-success)" }}>
                                        {fmtCents(invoice.total_cents)} paid
                                      </span>
                                    )}
                                    <button
                                      className="portalHistoryLinkBtn"
                                      onClick={() => navigate("/portal/invoices", { state: { invoiceId: invoice.id } })}
                                    >
                                      View
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
