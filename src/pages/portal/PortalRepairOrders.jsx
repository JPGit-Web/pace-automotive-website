import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listRepairOrders, getRepairOrder, createRepairOrder,
  updateRepairOrder, updateRepairOrderStatus,
  listCustomers, listVehiclesByCustomer, logActivity,
  getInspectionByRepairOrder, createInspectionForRepairOrder, createDefaultInspectionItems,
  getEstimateByRepairOrder, createEstimateForRepairOrder,
  getHelcimInvoiceByRepairOrder, createManualHelcimInvoice,
} from "../../lib/portalData";

/* ── Constants ─────────────────────────────────────────────── */
const RO_STATUSES = [
  "draft","active","waiting_approval","approved",
  "in_progress","completed","invoiced","closed","cancelled",
];
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
const STATUS_FILTERS  = ["all", ...RO_STATUSES];

const EMPTY_CREATE = {
  customer_id: "", vehicle_id: "", status: "draft",
  mileage_in: "", mileage_out: "", promised_date: "",
  customer_concern: "", cause: "", correction: "", internal_notes: "",
};
const EMPTY_EDIT = {
  status: "", mileage_in: "", mileage_out: "", promised_date: "",
  customer_concern: "", cause: "", correction: "", internal_notes: "",
  payment_status: "",
};

/* ── Helpers ────────────────────────────────────────────────── */
const statusClass = (s) => s?.replace(/_/g, "-") ?? "";
const fullName    = (c) => c ? `${c.first_name} ${c.last_name}` : "—";
const vehicleLabel = (v) => v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "—";

/** Format a full ISO timestamp (e.g. created_at). Safe — includes time offset. */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" });
}

/**
 * Format a date-only string (YYYY-MM-DD) without timezone shifting.
 * new Date("2026-06-10") is parsed as UTC midnight, which displays as
 * Jun 9 in negative-UTC timezones (e.g. Calgary UTC-6/UTC-7).
 * Using Date.UTC keeps the date anchored to the intended calendar day.
 */
function fmtDateOnly(dateStr) {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-CA", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function validateCreate(d) {
  const e = {};
  if (!d.customer_id) e.customer_id = "Customer is required.";
  if (!d.vehicle_id)  e.vehicle_id  = "Vehicle is required.";
  if (d.mileage_in && (isNaN(+d.mileage_in) || +d.mileage_in < 0))
    e.mileage_in = "Mileage must be 0 or greater.";
  return e;
}

/* ── Field component ── */
function Field({ label, name, type="text", required, error, value, onChange, placeholder }) {
  return (
    <div className="portalFormField">
      <label className="portalFormLabel" htmlFor={`ro-${name}`}>
        {label}{required && <span className="req">*</span>}
      </label>
      <input id={`ro-${name}`} name={name} type={type}
        className={`portalFormInput${error ? " invalid" : ""}`}
        value={value ?? ""} onChange={onChange} placeholder={placeholder} autoComplete="off" />
      {error && <p className="portalFormFieldError">{error}</p>}
    </div>
  );
}

function RODetailField({ label, value }) {
  const empty = !value;
  return (
    <div>
      <div className="portalDetailLabel">{label}</div>
      <div className={`portalDetailValue${empty ? " empty" : ""}`}>{value || "Not provided"}</div>
    </div>
  );
}

/* ============================================================ */
export default function PortalRepairOrders() {
  /* ── State ── */
  const [ros,           setRos]           = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [selected,      setSelected]      = useState(null);
  const [detailData,    setDetailData]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [changingStatus,setChangingStatus]= useState(false);
  const [modal,         setModal]         = useState(null); // null | 'create' | 'edit'
  const [formData,      setFormData]      = useState({});
  const [formErrors,    setFormErrors]    = useState({});
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState("");
  // For create modal — customer/vehicle selectors
  const [allCustomers,    setAllCustomers]    = useState([]);
  const [custVehicles,    setCustVehicles]    = useState([]);
  const [custLoading,     setCustLoading]     = useState(false);
  // Inspection state for current RO
  const [roInspection,    setRoInspection]    = useState(null);
  const [inspLoading,     setInspLoading]     = useState(false);
  // Estimate state for current RO
  const [roEstimate,      setRoEstimate]      = useState(null);
  const [estLoading,      setEstLoading]      = useState(false);
  // Invoice state for current RO
  const [roInvoice,       setRoInvoice]       = useState(null);
  const [invLoading,      setInvLoading]      = useState(false);
  const navigate = useNavigate();

  /* ── Load repair orders ── */
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRos(await listRepairOrders()); }
    catch { setError("Failed to load repair orders. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ── Load detail + check for existing inspection ── */
  async function selectRO(ro) {
    if (selected?.id === ro.id) { setSelected(null); setDetailData(null); setRoInspection(null); return; }
    setSelected(ro);
    setDetailLoading(true);
    setRoInspection(null);
    setRoEstimate(null);
    setRoInvoice(null);
    try {
      const [detail, insp, est, inv] = await Promise.all([
        getRepairOrder(ro.id),
        getInspectionByRepairOrder(ro.id).catch(() => null),
        getEstimateByRepairOrder(ro.id).catch(() => null),
        getHelcimInvoiceByRepairOrder(ro.id).catch(() => null),
      ]);
      setDetailData(detail);
      setRoInspection(insp);
      setRoEstimate(est);
      setRoInvoice(inv);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[PortalRepairOrders] detail load failed:", err);
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }

  /* ── Link invoice ── */
  async function handleLinkInvoice() {
    if (!selected) return;
    setInvLoading(true);
    try {
      const inv = await createManualHelcimInvoice({ repair_order_id: selected.id });
      await logActivity("invoice.created", "helcim_invoice", inv.id, {
        ro_number: selected.ro_number, manual: true,
      });
      setRoInvoice(inv);
      navigate("/portal/invoices", { state: { invoiceId: inv.id } });
    } catch {
      alert("Failed to create invoice record. Please try again.");
    } finally {
      setInvLoading(false);
    }
  }

  /* ── Create estimate ── */
  async function handleCreateEstimate() {
    if (!selected) return;
    setEstLoading(true);
    try {
      const est = await createEstimateForRepairOrder(selected.id);
      await logActivity("estimate.created", "estimate", est.id, {
        estimate_number: est.estimate_number, ro_number: selected.ro_number,
      });
      setRoEstimate(est);
      navigate("/portal/estimates", { state: { estimateId: est.id } });
    } catch {
      alert("Failed to create estimate. Please try again.");
    } finally {
      setEstLoading(false);
    }
  }

  /* ── Start inspection ── */
  async function handleStartInspection() {
    if (!selected) return;
    setInspLoading(true);
    try {
      const insp = await createInspectionForRepairOrder(selected.id);
      await createDefaultInspectionItems(insp.id);
      await logActivity("inspection.created", "inspection", insp.id, { ro_number: selected.ro_number });
      setRoInspection(insp);
      navigate("/portal/inspections", { state: { inspectionId: insp.id } });
    } catch {
      alert("Failed to start inspection. Please try again.");
    } finally {
      setInspLoading(false);
    }
  }

  /* ── Filter ── */
  const filtered = ros.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      r.ro_number?.toLowerCase().includes(t) ||
      r.customers?.first_name?.toLowerCase().includes(t) ||
      r.customers?.last_name?.toLowerCase().includes(t) ||
      r.vehicles?.make?.toLowerCase().includes(t) ||
      r.vehicles?.model?.toLowerCase().includes(t) ||
      r.vehicles?.license_plate?.toLowerCase().includes(t)
    );
  });
  const counts = ros.reduce((a, r) => { a[r.status] = (a[r.status]||0)+1; return a; }, {});

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!selected || selected.status === newStatus) return;
    setChangingStatus(true);
    try {
      const updated = await updateRepairOrderStatus(selected.id, newStatus);
      await logActivity("repair_order.status_changed", "repair_order", selected.id, {
        ro_number: selected.ro_number, from: selected.status, to: newStatus,
      });
      setRos((p) => p.map((r) => r.id === updated.id ? updated : r));
      setSelected(updated);
      if (detailData?.id === updated.id) setDetailData((d) => d ? { ...d, status: newStatus } : d);
    } catch { alert("Failed to update status. Please try again."); }
    finally { setChangingStatus(false); }
  }

  async function handleCancel() {
    if (!selected) return;
    if (!window.confirm(`Cancel repair order ${selected.ro_number}? This sets status to Cancelled and cannot be undone easily.`)) return;
    setChangingStatus(true);
    try {
      const updated = await updateRepairOrderStatus(selected.id, "cancelled");
      await logActivity("repair_order.cancelled", "repair_order", selected.id, {
        ro_number: selected.ro_number,
      });
      setRos((p) => p.map((r) => r.id === updated.id ? updated : r));
      setSelected(updated);
      if (detailData) setDetailData((d) => d ? { ...d, status: "cancelled" } : d);
    } catch { alert("Failed to cancel repair order. Please try again."); }
    finally { setChangingStatus(false); }
  }

  /* ── Open create modal ── */
  async function openCreate() {
    setFormData({ ...EMPTY_CREATE });
    setFormErrors({});
    setSaveError("");
    setCustVehicles([]);
    setModal("create");
    // Load customers
    setCustLoading(true);
    try { setAllCustomers(await listCustomers()); }
    catch { setAllCustomers([]); }
    finally { setCustLoading(false); }
  }

  /* ── Open edit modal ── */
  function openEdit() {
    if (!detailData) return;
    setFormData({
      status:           detailData.status ?? "draft",
      mileage_in:       detailData.mileage_in?.toString() ?? "",
      mileage_out:      detailData.mileage_out?.toString() ?? "",
      promised_date:    detailData.promised_date ?? "",
      customer_concern: detailData.customer_concern ?? "",
      cause:            detailData.cause ?? "",
      correction:       detailData.correction ?? "",
      internal_notes:   detailData.internal_notes ?? "",
      payment_status:   detailData.payment_status ?? "unpaid",
    });
    setFormErrors({});
    setSaveError("");
    setModal("edit");
  }

  function closeModal() {
    setModal(null); setFormData({}); setFormErrors({}); setSaveError("");
    setCustVehicles([]);
  }

  function handleField(e) {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: "" }));
  }

  /* When customer changes in create form, load their vehicles */
  async function handleCustomerChange(e) {
    const id = e.target.value;
    setFormData((p) => ({ ...p, customer_id: id, vehicle_id: "" }));
    setCustVehicles([]);
    if (!id) return;
    try { setCustVehicles(await listVehiclesByCustomer(id)); }
    catch { setCustVehicles([]); }
  }

  /* ── Save create ── */
  async function handleCreate(e) {
    e.preventDefault();
    const errors = validateCreate(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setSaving(true); setSaveError("");
    try {
      const ro = await createRepairOrder({
        ...formData,
        mileage_in: formData.mileage_in ? parseInt(formData.mileage_in, 10) : null,
      });
      await logActivity("repair_order.created", "repair_order", ro.id, {
        ro_number: ro.ro_number,
      });
      // Fetch the full list-display row (with customer/vehicle names) then refresh
      closeModal();
      await load(); // reload the full list so the new RO shows with customer/vehicle
      setSelected(ro);
      setDetailData(await getRepairOrder(ro.id));
    } catch { setSaveError("Failed to create repair order. Please try again."); }
    finally { setSaving(false); }
  }

  /* ── Save edit ── */
  async function handleEdit(e) {
    e.preventDefault();
    setSaving(true); setSaveError("");
    try {
      const updated = await updateRepairOrder(selected.id, {
        ...formData,
        mileage_in:  formData.mileage_in  ? parseInt(formData.mileage_in, 10)  : null,
        mileage_out: formData.mileage_out ? parseInt(formData.mileage_out, 10) : null,
      });
      await logActivity("repair_order.updated", "repair_order", selected.id, {
        ro_number: selected.ro_number,
      });
      // Refresh list entry
      setRos((p) => p.map((r) => r.id === updated.id
        ? { ...r, status: updated.status, payment_status: updated.payment_status, promised_date: updated.promised_date }
        : r
      ));
      setSelected((s) => s ? { ...s, status: updated.status, payment_status: updated.payment_status, promised_date: updated.promised_date } : s);
      setDetailData((d) => d ? { ...d, ...updated } : d);
      closeModal();
    } catch { setSaveError("Failed to save repair order. Please try again."); }
    finally { setSaving(false); }
  }

  /* ── Render ── */
  return (
    <PortalLayout title="Repair Orders">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Repair Orders</h2>
          <p className="portalPageDesc">Create and track repair orders through the full shop workflow.</p>
        </div>
        <button className="portalBtn portalBtnPrimary" onClick={openCreate}>
          <i className="fa-solid fa-plus"></i> New Repair Order
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"16px" }}>
        <div className="portalToolbar" style={{ marginBottom:0 }}>
          <div className="portalSearchBar">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input className="portalSearchInput"
              placeholder="Search by RO #, customer, vehicle, or plate…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize:".82rem", color:"var(--p-text-3)" }}>
              {filtered.length} order{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="portalFilterTabs" style={{ flexWrap:"wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <button key={s}
              className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : RO_STATUS_LABELS[s]}
              <span style={{ marginLeft:5, fontSize:".7rem", opacity:.7 }}>
                {s === "all" ? ros.length : (counts[s] || "")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="portalCard" style={{ padding:0, overflow:"hidden" }}>
        {loading ? (
          <div className="portalEmptyState"><p style={{ color:"var(--p-text-3)" }}>Loading repair orders…</p></div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load repair orders</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={load}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-screwdriver-wrench" style={{ opacity:.25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search || statusFilter !== "all" ? "No repair orders match your filters" : "No repair orders yet"}
            </p>
            <p className="portalEmptyDesc">
              {search || statusFilter !== "all"
                ? "Try clearing the search or changing the status filter."
                : "Create a new repair order or convert an appointment request."}
            </p>
          </div>
        ) : (
          <table className="portalTable">
            <thead>
              <tr>
                <th>RO #</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Promised</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => selectRO(r)}
                  style={{ cursor:"pointer", background: selected?.id === r.id ? "rgba(11,27,58,.04)" : undefined }}>
                  <td style={{ fontFamily:"monospace", fontWeight:700, color:"var(--p-navy)", fontSize:".88rem" }}>
                    {r.ro_number}
                  </td>
                  <td style={{ fontWeight:600 }}>{fullName(r.customers)}</td>
                  <td style={{ fontSize:".85rem", color:"var(--p-text-2)" }}>{vehicleLabel(r.vehicles)}</td>
                  <td><span className={`portalBadge ${statusClass(r.status)}`}>{RO_STATUS_LABELS[r.status] ?? r.status}</span></td>
                  <td><span className={`portalBadge ${r.payment_status}`}>{PAYMENT_LABELS[r.payment_status] ?? r.payment_status}</span></td>
                  <td style={{ fontSize:".83rem", color:"var(--p-text-2)" }}>{fmtDateOnly(r.promised_date)}</td>
                  <td style={{ fontSize:".83rem", color:"var(--p-text-3)", whiteSpace:"nowrap" }}>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="portalRODetail">
          <div className="portalRODetailHeader">
            <div>
              <p className="portalRONumber">{selected.ro_number}</p>
              <div className="portalROBadges">
                <span className={`portalBadge ${statusClass(selected.status)}`}>
                  {RO_STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <span className={`portalBadge ${selected.payment_status}`}>
                  {PAYMENT_LABELS[selected.payment_status] ?? selected.payment_status}
                </span>
                <span style={{ fontSize:".78rem", color:"var(--p-text-3)" }}>
                  Created {fmtDate(selected.created_at)}
                </span>
              </div>
            </div>
            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
              <button className="portalBtn portalBtnSecondary" onClick={openEdit} disabled={detailLoading}>
                <i className="fa-solid fa-pen"></i> Edit
              </button>
              {selected.status !== "cancelled" && (
                <button className="portalBtn portalBtnDanger" onClick={handleCancel} disabled={changingStatus}>
                  <i className="fa-solid fa-ban"></i> Cancel RO
                </button>
              )}
              <button style={{ background:"none", border:"none", cursor:"pointer", color:"var(--p-text-3)", fontSize:".82rem", fontFamily:"inherit" }}
                onClick={() => { setSelected(null); setDetailData(null); }}>
                ✕ Close
              </button>
            </div>
          </div>

          {detailLoading ? (
            <p style={{ color:"var(--p-text-3)", fontSize:".88rem" }}>Loading details…</p>
          ) : detailData ? (
            <>
              {/* Customer + Vehicle */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px", marginBottom:"18px" }}>
                <div className="portalRODetailSection">
                  <p className="portalROSectionTitle">Customer</p>
                  <div className="portalROInfoGrid">
                    <RODetailField label="Name"  value={fullName(detailData.customers)} />
                    <RODetailField label="Phone" value={detailData.customers?.phone} />
                    <RODetailField label="Email" value={detailData.customers?.email} />
                  </div>
                </div>
                <div className="portalRODetailSection">
                  <p className="portalROSectionTitle">Vehicle</p>
                  <div className="portalROInfoGrid">
                    <RODetailField label="Vehicle"       value={vehicleLabel(detailData.vehicles)} />
                    <RODetailField label="License Plate" value={detailData.vehicles?.license_plate
                      ? `${detailData.vehicles.license_plate}${detailData.vehicles.plate_province ? ` (${detailData.vehicles.plate_province})` : ""}` : null} />
                    <RODetailField label="Color"  value={detailData.vehicles?.color} />
                    <RODetailField label="Mileage In"  value={detailData.mileage_in != null ? `${detailData.mileage_in.toLocaleString()} km` : null} />
                    <RODetailField label="Mileage Out" value={detailData.mileage_out != null ? `${detailData.mileage_out.toLocaleString()} km` : null} />
                    <RODetailField label="Promised"    value={fmtDateOnly(detailData.promised_date)} />
                  </div>
                </div>
              </div>

              {/* 3-C fields */}
              <div className="portalRODetailSection">
                <p className="portalROSectionTitle">Job Details</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
                  {[["Customer Concern", detailData.customer_concern],
                    ["Cause",           detailData.cause],
                    ["Correction",      detailData.correction]].map(([lbl, val]) => (
                    <div key={lbl}>
                      <div className="portalDetailLabel">{lbl}</div>
                      <div className={`portalROTextField${!val ? " empty" : ""}`}>
                        {val || "Not provided"}
                      </div>
                    </div>
                  ))}
                </div>
                {detailData.internal_notes && (
                  <div style={{ marginTop:"12px" }}>
                    <div className="portalDetailLabel">Internal Notes</div>
                    <div className="portalROTextField" style={{ marginTop:"4px" }}>{detailData.internal_notes}</div>
                  </div>
                )}
              </div>

              {/* Linked appointment */}
              {detailData.appointment_requests && (
                <div className="portalRODetailSection">
                  <p className="portalROSectionTitle">Converted From Appointment</p>
                  <div className="portalROInfoGrid">
                    <RODetailField label="Submitted By" value={detailData.appointment_requests.name} />
                    <RODetailField label="Service"      value={detailData.appointment_requests.service_requested} />
                    <RODetailField label="Source"       value={detailData.appointment_requests.source?.replace("_"," ")} />
                  </div>
                </div>
              )}

              {/* Status change */}
              <div className="portalApptStatusActions">
                <span className="label">Status:</span>
                {["draft","active","in_progress","waiting_approval","approved","completed","invoiced","closed"].map((s) => (
                  <button key={s}
                    className={`portalBtnStatus${selected.status === s ? " active" : ""}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={changingStatus || selected.status === s || selected.status === "cancelled"}>
                    {RO_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>

              {/* Linked actions */}
              <div style={{ display:"flex", gap:"8px", marginTop:"12px", paddingTop:"12px", borderTop:"1px solid var(--p-border)", flexWrap:"wrap" }}>
                {roInspection ? (
                  <button className="portalBtn portalBtnPrimary"
                    onClick={() => navigate("/portal/inspections", { state: { inspectionId: roInspection.id } })}>
                    <i className="fa-solid fa-clipboard-check"></i> View Inspection
                  </button>
                ) : (
                  <button className="portalBtn portalBtnSecondary"
                    onClick={handleStartInspection}
                    disabled={inspLoading || selected?.status === "cancelled"}>
                    <i className="fa-solid fa-clipboard-check"></i>
                    {inspLoading ? " Starting…" : " Start Inspection"}
                  </button>
                )}
                {roEstimate ? (
                  <button className="portalBtn portalBtnPrimary"
                    onClick={() => navigate("/portal/estimates", { state: { estimateId: roEstimate.id } })}>
                    <i className="fa-solid fa-file-invoice-dollar"></i> View Estimate
                  </button>
                ) : (
                  <button className="portalBtn portalBtnSecondary"
                    onClick={handleCreateEstimate}
                    disabled={estLoading || selected?.status === "cancelled"}>
                    <i className="fa-solid fa-file-invoice-dollar"></i>
                    {estLoading ? " Creating…" : " Create Estimate"}
                  </button>
                )}
                {roInvoice ? (
                  <button className="portalBtn portalBtnPrimary"
                    onClick={() => navigate("/portal/invoices", { state: { invoiceId: roInvoice.id } })}>
                    <i className="fa-solid fa-receipt"></i> View Invoice
                  </button>
                ) : (
                  <button className="portalBtn portalBtnSecondary"
                    onClick={handleLinkInvoice}
                    disabled={invLoading || selected?.status === "cancelled"}>
                    <i className="fa-solid fa-receipt"></i>
                    {invLoading ? " Creating…" : " Link Invoice"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p style={{ color:"var(--p-text-3)", fontSize:".88rem" }}>Could not load detail. Click to retry.</p>
          )}
        </div>
      )}

      {/* Create Modal */}
      {modal === "create" && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="portalModalCard" style={{ maxWidth:"580px" }} role="dialog" aria-modal="true" aria-label="New Repair Order">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">New Repair Order</h2>
              <button className="portalModalClose" onClick={closeModal}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleCreate} noValidate>
              <div className="portalModalBody">
                {saveError && <div className="portalModalError">{saveError}</div>}
                <div className="portalForm">
                  {/* Customer */}
                  <div className="portalFormField">
                    <label className="portalFormLabel">Customer<span className="req">*</span></label>
                    {custLoading ? (
                      <p style={{ fontSize:".83rem", color:"var(--p-text-3)" }}>Loading customers…</p>
                    ) : (
                      <select className={`portalFormSelect${formErrors.customer_id ? " invalid" : ""}`}
                        name="customer_id" value={formData.customer_id} onChange={handleCustomerChange}>
                        <option value="">— Select customer —</option>
                        {allCustomers.map((c) => (
                          <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>
                        ))}
                      </select>
                    )}
                    {formErrors.customer_id && <p className="portalFormFieldError">{formErrors.customer_id}</p>}
                  </div>

                  {/* Vehicle */}
                  <div className="portalFormField">
                    <label className="portalFormLabel">Vehicle<span className="req">*</span></label>
                    {!formData.customer_id ? (
                      <p className="portalSelectorNote">Select a customer first to load their vehicles.</p>
                    ) : custVehicles.length === 0 ? (
                      <p className="portalSelectorNote">
                        This customer has no vehicles on file.
                        <a href="/portal/customers" style={{ color:"var(--p-navy)", marginLeft:6, fontWeight:600 }}>
                          Add a vehicle from the Customers page.
                        </a>
                      </p>
                    ) : (
                      <select className={`portalFormSelect${formErrors.vehicle_id ? " invalid" : ""}`}
                        name="vehicle_id" value={formData.vehicle_id} onChange={handleField}>
                        <option value="">— Select vehicle —</option>
                        {custVehicles.map((v) => (
                          <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(" ")}{v.license_plate ? ` — ${v.license_plate}` : ""}</option>
                        ))}
                      </select>
                    )}
                    {formErrors.vehicle_id && <p className="portalFormFieldError">{formErrors.vehicle_id}</p>}
                  </div>

                  <div className="portalFormRow">
                    <Field label="Mileage In (km)" name="mileage_in" type="number"
                      error={formErrors.mileage_in} value={formData.mileage_in} onChange={handleField} placeholder="e.g. 87500" />
                    <Field label="Promised Date" name="promised_date" type="date"
                      value={formData.promised_date} onChange={handleField} />
                  </div>

                  <div className="portalFormField">
                    <label className="portalFormLabel">Customer Concern</label>
                    <textarea className="portalFormTextarea" name="customer_concern" rows={2}
                      placeholder="What did the customer report?"
                      value={formData.customer_concern} onChange={handleField} />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Internal Notes</label>
                    <textarea className="portalFormTextarea" name="internal_notes" rows={2}
                      placeholder="Staff-only notes…"
                      value={formData.internal_notes} onChange={handleField} />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving || !formData.customer_id || !formData.vehicle_id}>
                  {saving ? "Creating…" : "Create Repair Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modal === "edit" && detailData && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="portalModalCard" style={{ maxWidth:"580px" }} role="dialog" aria-modal="true" aria-label="Edit Repair Order">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Edit {selected?.ro_number}</h2>
              <button className="portalModalClose" onClick={closeModal}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleEdit} noValidate>
              <div className="portalModalBody">
                {saveError && <div className="portalModalError">{saveError}</div>}
                <div className="portalForm">
                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel">Status</label>
                      <select className="portalFormSelect" name="status" value={formData.status} onChange={handleField}>
                        {RO_STATUSES.map((s) => <option key={s} value={s}>{RO_STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Payment Status</label>
                      <select className="portalFormSelect" name="payment_status" value={formData.payment_status} onChange={handleField}>
                        <option value="unpaid">Unpaid</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div className="portalFormRow">
                    <Field label="Mileage In (km)"  name="mileage_in"  type="number" value={formData.mileage_in}  onChange={handleField} />
                    <Field label="Mileage Out (km)" name="mileage_out" type="number" value={formData.mileage_out} onChange={handleField} />
                  </div>
                  <Field label="Promised Date" name="promised_date" type="date" value={formData.promised_date} onChange={handleField} />
                  {[
                    ["Customer Concern", "customer_concern", "What did the customer report?"],
                    ["Cause",            "cause",            "What did the technician find?"],
                    ["Correction",       "correction",       "What was done to fix it?"],
                    ["Internal Notes",   "internal_notes",   "Staff-only notes…"],
                  ].map(([lbl, name, ph]) => (
                    <div key={name} className="portalFormField">
                      <label className="portalFormLabel">{lbl}</label>
                      <textarea className="portalFormTextarea" name={name} rows={2}
                        placeholder={ph} value={formData[name] ?? ""} onChange={handleField} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
