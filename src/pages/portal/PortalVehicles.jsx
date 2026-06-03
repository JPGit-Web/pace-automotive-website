import { useState, useEffect, useCallback } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import { listVehicles } from "../../lib/portalData";

const vehicleLabel = (v) => [v.year, v.make, v.model].filter(Boolean).join(" ");

export default function PortalVehicles() {
  const [vehicles,  setVehicles]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState(null);

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
                    style={{ cursor: "pointer" }}
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

            {/* Inline detail panel */}
            {selected && (
              <div style={{
                margin: "0 20px 20px",
                padding: "16px 18px",
                background: "var(--p-bg)",
                border: "1px solid var(--p-border)",
                borderRadius: "var(--p-radius-sm)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <strong style={{ fontSize: "1rem", color: "var(--p-text)" }}>{vehicleLabel(selected)}</strong>
                    {selected.customers && (
                      <span style={{ marginLeft: 10, fontSize: ".83rem", color: "var(--p-text-2)" }}>
                        — {selected.customers.first_name} {selected.customers.last_name}
                      </span>
                    )}
                  </div>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text-3)", fontFamily: "inherit", fontSize: ".8rem" }}
                    onClick={() => setSelected(null)}
                  >
                    ✕ Close
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 20px" }}>
                  {[
                    ["Trim",         selected.trim],
                    ["Color",        selected.color],
                    ["License Plate",selected.license_plate],
                    ["Plate Province",selected.plate_province],
                    ["VIN",          selected.vin],
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
                <p style={{ margin: "12px 0 0", fontSize: ".75rem", color: "var(--p-text-3)" }}>
                  To edit or remove this vehicle, open the customer record.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
