import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listAppointmentRequests,
  createAppointmentRequest,
  updateAppointmentRequestStatus,
  convertAppointmentToRepairOrder,
  listCustomers,
  listVehiclesByCustomer,
  logActivity,
} from "../../lib/portalData";

/* ── Constants ─────────────────────────────────────────────── */
const SERVICES = [
  "Diagnostics", "Oil Change & Maintenance", "Brakes", "Tires",
  "Battery & Electrical", "Steering & Suspension", "Heating & Cooling",
  "General Repair", "Other",
];

const STATUS_FILTERS = ["all", "pending", "confirmed", "cancelled", "converted"];

const STATUS_LABELS = {
  pending:   "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  converted: "Converted",
};

const SOURCE_LABELS = {
  web_form: "Web Form",
  phone:    "Phone",
  walk_in:  "Walk-in",
};

const EMPTY_FORM = {
  source:            "phone",
  name:              "",
  phone:             "",
  email:             "",
  vehicle_info:      "",
  service_requested: "",
  preferred_date:    "",
  notes:             "",
};

/* ── Helpers ────────────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function sourceClass(source) {
  return source === "web_form" ? "web-form" : source?.replace("_", "-") ?? "";
}

function validateForm(d) {
  const e = {};
  if (!d.name?.trim())  e.name  = "Name is required.";
  if (!d.phone?.trim()) e.phone = "Phone is required.";
  return e;
}

const EMPTY_CONVERT = {
  customer_id: "", vehicle_id: "", mileage_in: "",
  promised_date: "", customer_concern: "", internal_notes: "",
};

/* ============================================================ */
export default function PortalAppointments() {
  const navigate = useNavigate();

  /* ── State ── */
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [selected,      setSelected]      = useState(null);
  const [changingStatus,setChangingStatus]= useState(false);
  const [modal,         setModal]         = useState(false);
  const [formData,      setFormData]      = useState({ ...EMPTY_FORM });
  const [formErrors,    setFormErrors]    = useState({});
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState("");
  // Convert-to-RO modal state
  const [convertModal,    setConvertModal]    = useState(false);
  const [convertForm,     setConvertForm]     = useState({ ...EMPTY_CONVERT });
  const [convertErrors,   setConvertErrors]   = useState({});
  const [converting,      setConverting]      = useState(false);
  const [convertError,    setConvertError]    = useState("");
  const [convertCustomers,setConvertCustomers]= useState([]);
  const [convertVehicles, setConvertVehicles] = useState([]);
  const [custLoadingConv, setCustLoadingConv] = useState(false);

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await listAppointmentRequests());
    } catch {
      setError("Failed to load appointment requests. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Filter ── */
  const filtered = requests.filter((r) => {
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    if (!matchesStatus) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(t) ||
      r.phone?.includes(t) ||
      r.email?.toLowerCase().includes(t) ||
      r.vehicle_info?.toLowerCase().includes(t) ||
      r.service_requested?.toLowerCase().includes(t)
    );
  });

  /* ── Status counts for filter tabs ── */
  const counts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  /* ── Row click ── */
  function selectRequest(r) {
    setSelected((prev) => (prev?.id === r.id ? null : r));
  }

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!selected || selected.status === newStatus) return;
    setChangingStatus(true);
    try {
      const updated = await updateAppointmentRequestStatus(selected.id, newStatus);
      await logActivity("appointment.status_changed", "appointment_request", selected.id, {
        name: selected.name, from: selected.status, to: newStatus,
      });
      setRequests((p) => p.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
    } catch {
      alert("Failed to update status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  }

  /* ── Modal ── */
  function openModal() {
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setSaveError("");
    setModal(true);
  }

  function closeModal() {
    setModal(false);
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setSaveError("");
  }

  function handleField(e) {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setSaving(true);
    setSaveError("");
    try {
      const created = await createAppointmentRequest({ ...formData, status: "pending" });
      await logActivity("appointment.created", "appointment_request", created.id, {
        name: created.name, source: created.source,
      });
      setRequests((p) => [created, ...p]);
      closeModal();
      setSelected(created);
    } catch {
      setSaveError("Failed to save appointment request. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Convert to RO modal ── */
  async function openConvertModal() {
    if (!selected) return;
    const concern = [selected.service_requested, selected.notes].filter(Boolean).join(" — ");
    setConvertForm({ ...EMPTY_CONVERT, customer_concern: concern });
    setConvertErrors({});
    setConvertError("");
    setConvertVehicles([]);
    setConvertModal(true);
    setCustLoadingConv(true);
    try { setConvertCustomers(await listCustomers()); }
    catch { setConvertCustomers([]); }
    finally { setCustLoadingConv(false); }
  }

  function closeConvertModal() {
    setConvertModal(false);
    setConvertForm({ ...EMPTY_CONVERT });
    setConvertErrors({});
    setConvertError("");
    setConvertVehicles([]);
  }

  function handleConvertField(e) {
    const { name, value } = e.target;
    setConvertForm((p) => ({ ...p, [name]: value }));
    if (convertErrors[name]) setConvertErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleConvertCustomer(e) {
    const id = e.target.value;
    setConvertForm((p) => ({ ...p, customer_id: id, vehicle_id: "" }));
    setConvertVehicles([]);
    if (!id) return;
    try { setConvertVehicles(await listVehiclesByCustomer(id)); }
    catch { setConvertVehicles([]); }
  }

  async function handleConvertSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!convertForm.customer_id) errors.customer_id = "Customer is required.";
    if (!convertForm.vehicle_id)  errors.vehicle_id  = "Vehicle is required.";
    if (Object.keys(errors).length) { setConvertErrors(errors); return; }

    setConverting(true);
    setConvertError("");
    try {
      const ro = await convertAppointmentToRepairOrder(selected.id, {
        customerId:      convertForm.customer_id,
        vehicleId:       convertForm.vehicle_id,
        mileageIn:       convertForm.mileage_in    || null,
        promisedDate:    convertForm.promised_date || null,
        customerConcern: convertForm.customer_concern || null,
        internalNotes:   convertForm.internal_notes  || null,
      });
      await logActivity("repair_order.created", "repair_order", ro.id, {
        ro_number: ro.ro_number, source: "appointment_conversion",
      });
      await logActivity("appointment.converted_to_repair_order", "appointment_request", selected.id, {
        ro_number: ro.ro_number, appointment_name: selected.name,
      });
      // Update local state
      const updatedAppt = { ...selected, status: "converted", repair_order_id: ro.id };
      setRequests((p) => p.map((r) => r.id === selected.id ? updatedAppt : r));
      setSelected(updatedAppt);
      closeConvertModal();
      // Navigate to the new RO
      navigate("/portal/repair-orders");
    } catch {
      setConvertError("Failed to convert appointment. Please try again.");
    } finally {
      setConverting(false);
    }
  }

  /* ── Render ── */
  return (
    <PortalLayout title="Appointments">
      {/* Page header */}
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Appointment Requests</h2>
          <p className="portalPageDesc">
            Web form submissions and manually entered phone/walk-in requests.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" onClick={openModal}>
          <i className="fa-solid fa-plus"></i> Add Request
        </button>
      </div>

      {/* Toolbar: search + status filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
        <div className="portalToolbar" style={{ marginBottom: 0 }}>
          <div className="portalSearchBar">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              className="portalSearchInput"
              placeholder="Search by name, phone, email, vehicle, or service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize: ".82rem", color: "var(--p-text-3)" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="portalFilterTabs">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              {s !== "all" && counts[s] ? (
                <span style={{ marginLeft: 6, fontSize: ".72rem", opacity: .75 }}>
                  {counts[s]}
                </span>
              ) : null}
              {s === "all" && (
                <span style={{ marginLeft: 6, fontSize: ".72rem", opacity: .75 }}>
                  {requests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main table */}
      <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="portalEmptyState">
            <p style={{ color: "var(--p-text-3)" }}>Loading appointment requests…</p>
          </div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load requests</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={load}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-calendar-days" style={{ opacity: .25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search || statusFilter !== "all"
                ? "No requests match your filters"
                : "No appointment requests yet"}
            </p>
            <p className="portalEmptyDesc">
              {search || statusFilter !== "all"
                ? "Try clearing the search or changing the status filter."
                : "Requests submitted through the public booking form will appear here automatically."}
            </p>
          </div>
        ) : (
          <table className="portalTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Service</th>
                <th>Preferred Time</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => selectRequest(r)}
                  style={{
                    cursor: "pointer",
                    background: selected?.id === r.id ? "rgba(11,27,58,.04)" : undefined,
                  }}
                >
                  <td style={{ fontSize: ".83rem", color: "var(--p-text-2)", whiteSpace: "nowrap" }}>
                    {fmtDate(r.created_at)}
                  </td>
                  <td style={{ fontWeight: 600, color: "var(--p-navy)" }}>{r.name}</td>
                  <td style={{ fontSize: ".88rem", color: "var(--p-text-2)" }}>{r.phone}</td>
                  <td style={{ fontSize: ".85rem", color: "var(--p-text-2)" }}>
                    {r.service_requested || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                  </td>
                  <td style={{ fontSize: ".83rem", color: "var(--p-text-2)" }}>
                    {r.preferred_date || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                  </td>
                  <td>
                    <span className={`portalBadge ${sourceClass(r.source)}`}>
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </span>
                  </td>
                  <td>
                    <span className={`portalBadge ${r.status}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel — shown when a row is selected */}
      {selected && (
        <div className="portalApptDetail">
          <div className="portalApptDetailHeader">
            <div>
              <h3 className="portalApptDetailName">{selected.name}</h3>
              <div className="portalApptDetailMeta">
                <span className={`portalBadge ${selected.status}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                <span className={`portalBadge ${sourceClass(selected.source)}`}>
                  {SOURCE_LABELS[selected.source] ?? selected.source}
                </span>
                <span style={{ fontSize: ".78rem", color: "var(--p-text-3)" }}>
                  Received {fmtDateTime(selected.created_at)}
                </span>
              </div>
            </div>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text-3)", fontSize: ".82rem", fontFamily: "inherit" }}
              onClick={() => setSelected(null)}
            >
              ✕ Close
            </button>
          </div>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 24px" }}>
            <DetailField label="Phone"      value={selected.phone} />
            <DetailField label="Email"      value={selected.email} />
            <DetailField label="Vehicle"    value={selected.vehicle_info} />
            <DetailField label="Service"    value={selected.service_requested} />
            <DetailField label="Preferred Time" value={selected.preferred_date} />
          </div>

          {selected.notes && (
            <div style={{ marginTop: "12px" }}>
              <div className="portalDetailLabel">Message / Additional Details</div>
              <div className="portalDetailValue" style={{ marginTop: "4px", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                {selected.notes}
              </div>
            </div>
          )}

          {/* Status actions */}
          <div className="portalApptStatusActions">
            <span className="label">Change Status:</span>
            {["pending", "confirmed", "cancelled"].map((s) => (
              <button
                key={s}
                className={`portalBtnStatus${selected.status === s ? " active" : ""}`}
                onClick={() => handleStatusChange(s)}
                disabled={changingStatus || selected.status === s}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              {selected.status === "converted" ? (
                <span className="portalConvertedBadge">
                  <i className="fa-solid fa-check"></i>
                  Converted{selected.repair_order_id ? " → RO created" : ""}
                </span>
              ) : (
                <button
                  className="portalBtnStatus"
                  onClick={openConvertModal}
                  disabled={changingStatus}
                  title="Convert this appointment into a repair order"
                >
                  <i className="fa-solid fa-arrow-right-to-bracket"></i> Convert to RO
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Add Request modal */}
      {modal && (
        <div
          className="portalModalOverlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="portalModalCard" role="dialog" aria-modal="true" aria-label="Add Appointment Request">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Add Appointment Request</h2>
              <button className="portalModalClose" onClick={closeModal} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSave} noValidate>
              <div className="portalModalBody">
                {saveError && <div className="portalModalError">{saveError}</div>}

                <div className="portalForm">
                  {/* Source */}
                  <div className="portalFormField">
                    <label className="portalFormLabel">Source</label>
                    <select
                      className="portalFormSelect"
                      name="source"
                      value={formData.source}
                      onChange={handleField}
                    >
                      <option value="phone">Phone</option>
                      <option value="walk_in">Walk-in</option>
                    </select>
                  </div>

                  <div className="portalFormRow">
                    <ApptField label="Name" name="name" required
                      error={formErrors.name} value={formData.name} onChange={handleField} />
                    <ApptField label="Phone" name="phone" type="tel" required
                      error={formErrors.phone} value={formData.phone} onChange={handleField} />
                  </div>

                  <ApptField label="Email" name="email" type="email"
                    value={formData.email} onChange={handleField} />

                  <div className="portalFormRow">
                    <ApptField label="Vehicle (Year / Make / Model)" name="vehicle_info"
                      placeholder="e.g. 2019 Honda Civic"
                      value={formData.vehicle_info} onChange={handleField} />
                    <div className="portalFormField">
                      <label className="portalFormLabel">Service Needed</label>
                      <select className="portalFormSelect" name="service_requested"
                        value={formData.service_requested} onChange={handleField}>
                        <option value="">— Select service —</option>
                        {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <ApptField label="Preferred Date / Time" name="preferred_date"
                    placeholder="e.g. Wednesday morning, any weekday after 2pm"
                    value={formData.preferred_date} onChange={handleField} />

                  <div className="portalFormField">
                    <label className="portalFormLabel">Notes</label>
                    <textarea
                      className="portalFormTextarea"
                      name="notes"
                      rows={3}
                      placeholder="Customer concerns, symptoms, or anything else to note…"
                      value={formData.notes}
                      onChange={handleField}
                    />
                  </div>
                </div>
              </div>

              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary"
                  onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
                  {saving ? "Saving…" : "Save Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to RO Modal */}
      {convertModal && selected && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && closeConvertModal()}>
          <div className="portalModalCard" style={{ maxWidth:"540px" }} role="dialog" aria-modal="true" aria-label="Convert to Repair Order">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Convert to Repair Order</h2>
              <button className="portalModalClose" onClick={closeConvertModal}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleConvertSubmit} noValidate>
              <div className="portalModalBody">
                {convertError && <div className="portalModalError">{convertError}</div>}

                {/* Appointment summary */}
                <div style={{ padding:"12px 14px", background:"var(--p-bg)", border:"1px solid var(--p-border)", borderRadius:"var(--p-radius-sm)", marginBottom:"18px", fontSize:".85rem" }}>
                  <strong>{selected.name}</strong> — {selected.phone}
                  {selected.service_requested && <> &nbsp;|&nbsp; {selected.service_requested}</>}
                  {selected.preferred_date && <div style={{ color:"var(--p-text-2)", marginTop:"2px" }}>Preferred: {selected.preferred_date}</div>}
                </div>

                <div className="portalForm">
                  {/* Customer selector */}
                  <div className="portalFormField">
                    <label className="portalFormLabel">Customer<span className="req">*</span></label>
                    {custLoadingConv ? (
                      <p style={{ fontSize:".83rem", color:"var(--p-text-3)" }}>Loading customers…</p>
                    ) : (
                      <select className={`portalFormSelect${convertErrors.customer_id ? " invalid" : ""}`}
                        name="customer_id" value={convertForm.customer_id} onChange={handleConvertCustomer}>
                        <option value="">— Select customer —</option>
                        {convertCustomers.map((c) => (
                          <option key={c.id} value={c.id}>{c.last_name}, {c.first_name} {c.phone ? `(${c.phone})` : ""}</option>
                        ))}
                      </select>
                    )}
                    {convertErrors.customer_id && <p className="portalFormFieldError">{convertErrors.customer_id}</p>}
                    <p style={{ fontSize:".75rem", color:"var(--p-text-3)", margin:"4px 0 0" }}>
                      Customer not listed? <a href="/portal/customers" style={{ color:"var(--p-navy)", fontWeight:600 }}>Create them in Customers first.</a>
                    </p>
                  </div>

                  {/* Vehicle selector */}
                  <div className="portalFormField">
                    <label className="portalFormLabel">Vehicle<span className="req">*</span></label>
                    {!convertForm.customer_id ? (
                      <p className="portalSelectorNote">Select a customer first to load their vehicles.</p>
                    ) : convertVehicles.length === 0 ? (
                      <p className="portalSelectorNote">
                        No vehicles on file for this customer.
                        <a href="/portal/customers" style={{ color:"var(--p-navy)", marginLeft:6, fontWeight:600 }}>Add one from the Customers page.</a>
                      </p>
                    ) : (
                      <select className={`portalFormSelect${convertErrors.vehicle_id ? " invalid" : ""}`}
                        name="vehicle_id" value={convertForm.vehicle_id} onChange={handleConvertField}>
                        <option value="">— Select vehicle —</option>
                        {convertVehicles.map((v) => (
                          <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(" ")}{v.license_plate ? ` — ${v.license_plate}` : ""}</option>
                        ))}
                      </select>
                    )}
                    {convertErrors.vehicle_id && <p className="portalFormFieldError">{convertErrors.vehicle_id}</p>}
                  </div>

                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel" htmlFor="conv-mileage">Mileage In (km)</label>
                      <input id="conv-mileage" className="portalFormInput" type="number" name="mileage_in"
                        placeholder="e.g. 87500" value={convertForm.mileage_in} onChange={handleConvertField} />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel" htmlFor="conv-date">Promised Date</label>
                      <input id="conv-date" className="portalFormInput" type="date" name="promised_date"
                        value={convertForm.promised_date} onChange={handleConvertField} />
                    </div>
                  </div>

                  <div className="portalFormField">
                    <label className="portalFormLabel">Customer Concern</label>
                    <textarea className="portalFormTextarea" name="customer_concern" rows={2}
                      placeholder="Pre-filled from appointment — edit as needed"
                      value={convertForm.customer_concern} onChange={handleConvertField} />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Internal Notes</label>
                    <textarea className="portalFormTextarea" name="internal_notes" rows={2}
                      placeholder="Staff-only notes for the repair order…"
                      value={convertForm.internal_notes} onChange={handleConvertField} />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary" onClick={closeConvertModal} disabled={converting}>
                  Cancel
                </button>
                <button type="submit" className="portalBtn portalBtnPrimary"
                  disabled={converting || !convertForm.customer_id || !convertForm.vehicle_id}>
                  {converting ? "Converting…" : "Create Repair Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

/* ── Small reusable field for the modal ── */
function ApptField({ label, name, type = "text", required, error, value, onChange, placeholder }) {
  return (
    <div className="portalFormField">
      <label className="portalFormLabel" htmlFor={`appt-${name}`}>
        {label}{required && <span className="req">*</span>}
      </label>
      <input
        id={`appt-${name}`}
        name={name}
        type={type}
        className={`portalFormInput${error ? " invalid" : ""}`}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
      />
      {error && <p className="portalFormFieldError">{error}</p>}
    </div>
  );
}

/* ── Detail field ── */
function DetailField({ label, value }) {
  return (
    <div>
      <div className="portalDetailLabel">{label}</div>
      <div className={`portalDetailValue${!value ? " empty" : ""}`}>
        {value || "Not provided"}
      </div>
    </div>
  );
}
