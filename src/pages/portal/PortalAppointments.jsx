import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listAppointmentRequests,
  createAppointmentRequest,
  updateAppointmentRequestStatus,
  saveAppointmentSchedule,
  confirmAppointmentRequest,
  sendAppointmentReply,
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

const STATUS_LABELS = {
  pending:    "Pending",
  processing: "Processing",
  confirmed:  "Confirmed",
  cancelled:  "Cancelled",
  converted:  "Converted",
};

const STATUS_FILTERS = ["all", "pending", "processing", "confirmed", "cancelled", "converted"];

const SOURCE_LABELS = {
  web_form: "Web Form",
  phone:    "Phone",
  walk_in:  "Walk-in",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EMPTY_FORM = {
  source: "phone", name: "", phone: "", email: "",
  vehicle_info: "", service_requested: "", preferred_date: "", notes: "",
};

const EMPTY_SCHED = { date: "", time: "", endTime: "", service: "" };

const EMPTY_CONVERT = {
  customer_id: "", vehicle_id: "", mileage_in: "",
  promised_date: "", customer_concern: "", internal_notes: "",
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

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

function sourceClass(source) {
  return source === "web_form" ? "web-form" : (source?.replace("_", "-") ?? "");
}

function validateAddForm(d) {
  const e = {};
  if (!d.name?.trim())  e.name  = "Name is required.";
  if (!d.phone?.trim()) e.phone = "Phone is required.";
  return e;
}

/* Convert local date + time strings to ISO timestamptz string */
function buildTimestamp(date, time) {
  if (!date) return null;
  const t = time || "00:00";
  return new Date(`${date}T${t}`).toISOString();
}

/* Pre-fill schedule form from an existing appointment */
function schedFromAppt(r) {
  if (!r?.scheduled_start) {
    return { date: "", time: "", endTime: "", service: r?.service_requested || "" };
  }
  const s = new Date(r.scheduled_start);
  const e = r.scheduled_end ? new Date(r.scheduled_end) : null;
  return {
    date:    `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,
    time:    `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,
    endTime: e ? `${String(e.getHours()).padStart(2,"0")}:${String(e.getMinutes()).padStart(2,"0")}` : "",
    service: r.scheduled_service || r.service_requested || "",
  };
}

/* ============================================================ */
export default function PortalAppointments() {
  const navigate = useNavigate();

  /* ── Core data ── */
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  /* ── View ── */
  const [view,     setView]     = useState("calendar");
  const [calMonth, setCalMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  /* ── Request list filter ── */
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  /* ── Detail modal ── */
  const [detailRequest, setDetailRequest] = useState(null);

  /* ── Reply ── */
  const [replyText,   setReplyText]   = useState("");
  const [replying,    setReplying]    = useState(false);
  const [replyResult, setReplyResult] = useState(null); // null | {ok} | {err}

  /* ── Scheduling ── */
  const [schedForm,   setSchedForm]   = useState({ ...EMPTY_SCHED });
  const [scheduling,  setScheduling]  = useState(false);
  const [schedError,  setSchedError]  = useState("");
  const [schedSaved,  setSchedSaved]  = useState(false);

  /* ── Status change ── */
  const [changingStatus, setChangingStatus] = useState(false);

  /* ── Add Request modal ── */
  const [addModal,    setAddModal]    = useState(false);
  const [formData,    setFormData]    = useState({ ...EMPTY_FORM });
  const [formErrors,  setFormErrors]  = useState({});
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState("");

  /* ── Convert to RO modal ── */
  const [convertModal,     setConvertModal]     = useState(false);
  const [convertForm,      setConvertForm]      = useState({ ...EMPTY_CONVERT });
  const [convertErrors,    setConvertErrors]    = useState({});
  const [converting,       setConverting]       = useState(false);
  const [convertError,     setConvertError]     = useState("");
  const [convertCustomers, setConvertCustomers] = useState([]);
  const [convertVehicles,  setConvertVehicles]  = useState([]);
  const [custLoadingConv,  setCustLoadingConv]  = useState(false);

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAppointmentRequests();
      setRequests(data);
      // Keep detail modal in sync if it's open
      setDetailRequest((prev) => {
        if (!prev) return null;
        return data.find((r) => r.id === prev.id) ?? prev;
      });
    } catch {
      setError("Failed to load appointment requests. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  /* ── Derived ── */
  // Calendar: only requests with a scheduled date (not cancelled)
  const scheduledRequests = requests.filter(
    (r) => r.scheduled_start && r.status !== "cancelled"
  );

  // Request list: filtered by search + status tab
  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
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

  const counts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  /* ── Calendar nav ── */
  function handleMonthNav(dir) {
    if (dir === 0) {
      const t = new Date();
      setCalMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    } else {
      setCalMonth((p) => new Date(p.getFullYear(), p.getMonth() + dir, 1));
    }
  }

  /* ── Shared state updater ── */
  function applyUpdate(updated) {
    setRequests((p) => p.map((r) => (r.id === updated.id ? updated : r)));
    setDetailRequest((p) => (p?.id === updated.id ? updated : p));
  }

  /* ── Detail modal ── */
  function openDetail(r) {
    setDetailRequest(r);
    setReplyText("");
    setReplyResult(null);
    setSchedError("");
    setSchedSaved(false);
    setSchedForm(schedFromAppt(r));
  }

  function closeDetail() {
    setDetailRequest(null);
    setReplyText("");
    setReplyResult(null);
    setSchedError("");
    setSchedSaved(false);
  }

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!detailRequest || detailRequest.status === newStatus) return;
    setChangingStatus(true);
    try {
      const updated = await updateAppointmentRequestStatus(detailRequest.id, newStatus);
      await logActivity("appointment.status_changed", "appointment_request", detailRequest.id, {
        name: detailRequest.name, from: detailRequest.status, to: newStatus,
      });
      applyUpdate(updated);
    } catch {
      alert("Failed to update status. Please try again.");
    } finally {
      setChangingStatus(false);
    }
  }

  /* ── Save scheduling details ── */
  async function handleScheduleSave() {
    if (!schedForm.date) { setSchedError("Appointment date is required."); return; }
    setScheduling(true);
    setSchedError("");
    setSchedSaved(false);
    try {
      const scheduledStart   = buildTimestamp(schedForm.date, schedForm.time || "08:00");
      const scheduledEnd     = schedForm.endTime ? buildTimestamp(schedForm.date, schedForm.endTime) : null;
      const scheduledService = schedForm.service?.trim() || null;
      const updated = await saveAppointmentSchedule(detailRequest.id, {
        scheduledStart, scheduledEnd, scheduledService,
      });
      applyUpdate(updated);
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 3000);
    } catch {
      setSchedError("Failed to save scheduling details. Please try again.");
    } finally {
      setScheduling(false);
    }
  }

  /* ── Confirm appointment ── */
  async function handleConfirm() {
    if (!schedForm.date || !schedForm.time) {
      setSchedError("Date and start time are required to confirm.");
      return;
    }
    setScheduling(true);
    setSchedError("");
    try {
      const scheduledStart   = buildTimestamp(schedForm.date, schedForm.time);
      const scheduledEnd     = schedForm.endTime ? buildTimestamp(schedForm.date, schedForm.endTime) : null;
      const scheduledService = schedForm.service?.trim() || null;
      const updated = await confirmAppointmentRequest(detailRequest.id, {
        scheduledStart, scheduledEnd, scheduledService,
      });
      await logActivity("appointment.confirmed", "appointment_request", detailRequest.id, {
        name: detailRequest.name, scheduled_start: scheduledStart,
      });
      applyUpdate(updated);
    } catch {
      setSchedError("Failed to confirm appointment. Please try again.");
    } finally {
      setScheduling(false);
    }
  }

  /* ── Send reply ── */
  async function handleSendReply() {
    if (!replyText.trim()) return;
    setReplying(true);
    setReplyResult(null);
    try {
      const result = await sendAppointmentReply(detailRequest.id, replyText.trim());
      if (result.noEmail) {
        setReplyResult({ err: "No customer email on this request. Please reply by phone." });
        return;
      }
      // Refresh the row so replied_at + status update are reflected
      const data = await listAppointmentRequests();
      setRequests(data);
      const updated = data.find((r) => r.id === detailRequest.id);
      if (updated) setDetailRequest(updated);
      setReplyText("");
      setReplyResult({ ok: true });
      await logActivity("appointment.replied", "appointment_request", detailRequest.id, {
        name: detailRequest.name,
      });
    } catch (err) {
      setReplyResult({ err: err.message || "Failed to send reply. Please try again." });
    } finally {
      setReplying(false);
    }
  }

  /* ── Add Request modal ── */
  function openAddModal() {
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setSaveError("");
    setAddModal(true);
  }
  function closeAddModal() {
    setAddModal(false);
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
    const errors = validateAddForm(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setSaving(true);
    setSaveError("");
    try {
      const created = await createAppointmentRequest({ ...formData, status: "pending" });
      await logActivity("appointment.created", "appointment_request", created.id, {
        name: created.name, source: created.source,
      });
      setRequests((p) => [created, ...p]);
      closeAddModal();
      openDetail(created);
    } catch {
      setSaveError("Failed to save appointment request. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Convert to RO modal ── */
  async function openConvertModal() {
    if (!detailRequest) return;
    const concern = [detailRequest.service_requested, detailRequest.notes].filter(Boolean).join(" — ");
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
      const ro = await convertAppointmentToRepairOrder(detailRequest.id, {
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
      await logActivity("appointment.converted_to_repair_order", "appointment_request", detailRequest.id, {
        ro_number: ro.ro_number, appointment_name: detailRequest.name,
      });
      const updatedAppt = { ...detailRequest, status: "converted", repair_order_id: ro.id };
      applyUpdate(updatedAppt);
      closeConvertModal();
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
          <h2 className="portalPageHeading">Appointments</h2>
          <p className="portalPageDesc">
            Scheduled appointments and incoming requests.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="apptViewToggle">
            <button
              className={`apptViewBtn${view === "calendar" ? " active" : ""}`}
              onClick={() => setView("calendar")}
            >
              <i className="fa-solid fa-calendar-days"></i> Calendar
            </button>
            <button
              className={`apptViewBtn${view === "list" ? " active" : ""}`}
              onClick={() => setView("list")}
            >
              <i className="fa-solid fa-list"></i> List
            </button>
          </div>
          <button className="portalBtn portalBtnPrimary" onClick={openAddModal}>
            <i className="fa-solid fa-plus"></i> Add Request
          </button>
        </div>
      </div>

      {/* ── Calendar (calendar-view only) ── */}
      {view === "calendar" && (
        <AppCalendar
          scheduledRequests={scheduledRequests}
          calMonth={calMonth}
          onMonthNav={handleMonthNav}
          onSelect={openDetail}
          selected={detailRequest}
          loading={loading}
          error={error}
          onRetry={load}
        />
      )}

      {/* ── Request list (both views) ── */}
      <div className="apptReqSection">
        <div className="apptReqSectionHeader">
          <div>
            <span className="apptReqSectionTitle">
              <i className="fa-solid fa-inbox"></i> Incoming Requests
            </span>
            <span className="apptReqCount">{requests.length}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="portalSearchBar" style={{ minWidth: "220px" }}>
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                className="portalSearchInput"
                placeholder="Search name, phone, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="portalFilterTabs" style={{ padding: "0 0 8px" }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span style={{ marginLeft: 5, fontSize: ".72rem", opacity: .75 }}>
                {s === "all" ? requests.length : (counts[s] || 0)}
              </span>
            </button>
          ))}
        </div>

        {/* Table / states */}
        <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div className="portalEmptyState">
              <p style={{ color: "var(--p-text-3)" }}>Loading requests…</p>
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
                {search || statusFilter !== "all" ? "No requests match your filters" : "No appointment requests yet"}
              </p>
              <p className="portalEmptyDesc">
                {search || statusFilter !== "all"
                  ? "Try clearing the search or changing the status filter."
                  : "Requests from the public booking form will appear here automatically."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="portalTable">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Vehicle</th>
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
                      onClick={() => openDetail(r)}
                      style={{
                        cursor: "pointer",
                        background: detailRequest?.id === r.id ? "rgba(11,27,58,.04)" : undefined,
                      }}
                    >
                      <td style={{ fontSize: ".83rem", color: "var(--p-text-2)", whiteSpace: "nowrap" }}>
                        {fmtDate(r.created_at)}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--p-navy)" }}>{r.name}</td>
                      <td style={{ fontSize: ".88rem", color: "var(--p-text-2)" }}>{r.phone || "—"}</td>
                      <td style={{ fontSize: ".83rem", color: "var(--p-text-2)" }}>
                        {r.email || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                      </td>
                      <td style={{ fontSize: ".83rem", color: "var(--p-text-2)" }}>
                        {r.vehicle_info || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                      </td>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span className={`portalBadge ${r.status}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                          {r.scheduled_start && (
                            <span
                              title={`Scheduled: ${fmtDateTime(r.scheduled_start)}`}
                              style={{ fontSize: ".7rem", color: "var(--p-text-3)" }}
                            >
                              <i className="fa-solid fa-calendar-check"></i>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {detailRequest && (
        <div
          className="portalModalOverlay"
          onClick={(e) => e.target === e.currentTarget && closeDetail()}
        >
          <div
            className="portalModalCard portalModalLg"
            role="dialog"
            aria-modal="true"
            aria-label="Appointment Request Detail"
          >
            {/* Header */}
            <div className="portalModalHeader">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 className="portalModalTitle" style={{ margin: 0 }}>{detailRequest.name}</h2>
                <span className={`portalBadge ${detailRequest.status}`}>
                  {STATUS_LABELS[detailRequest.status] ?? detailRequest.status}
                </span>
                <span className={`portalBadge ${sourceClass(detailRequest.source)}`}>
                  {SOURCE_LABELS[detailRequest.source] ?? detailRequest.source}
                </span>
              </div>
              <button className="portalModalClose" onClick={closeDetail} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="portalModalBody">

              {/* ── 1. Request Information ── */}
              <p className="apptModalSectionLabel">
                <i className="fa-solid fa-address-card"></i> Request Information
              </p>
              <div className="apptInfoGrid">
                <InfoField label="Phone"    value={detailRequest.phone} />
                <InfoField label="Email"    value={detailRequest.email} />
                <InfoField label="Vehicle"  value={detailRequest.vehicle_info} />
                <InfoField label="Service"  value={detailRequest.service_requested} />
                <InfoField label="Preferred Time" value={detailRequest.preferred_date} />
                <InfoField label="Received" value={fmtDateTime(detailRequest.created_at)} />
              </div>
              {detailRequest.notes && (
                <div style={{ marginTop: "12px" }}>
                  <div className="portalDetailLabel">Message / Additional Details</div>
                  <div className="portalDetailValue" style={{ marginTop: "4px", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
                    {detailRequest.notes}
                  </div>
                </div>
              )}

              <hr className="apptModalDivider" />

              {/* ── 2. Schedule ── */}
              <p className="apptModalSectionLabel">
                <i className="fa-solid fa-calendar-check"></i> Schedule Appointment
              </p>

              {detailRequest.scheduled_start && (
                <div className="apptSchedConfirmed">
                  <i className="fa-solid fa-clock" style={{ marginRight: 6, opacity: .7 }}></i>
                  Currently scheduled: <strong>{fmtDateTime(detailRequest.scheduled_start)}</strong>
                  {detailRequest.scheduled_end && (
                    <> — {fmtTime(detailRequest.scheduled_end)}</>
                  )}
                  {detailRequest.scheduled_service && (
                    <span style={{ marginLeft: 8, opacity: .75 }}>· {detailRequest.scheduled_service}</span>
                  )}
                </div>
              )}

              <div className="apptSchedForm">
                <div className="portalFormRow" style={{ gap: "10px" }}>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Date</label>
                    <input
                      type="date"
                      className="portalFormInput"
                      value={schedForm.date}
                      onChange={(e) => setSchedForm((p) => ({ ...p, date: e.target.value }))}
                    />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Start Time</label>
                    <input
                      type="time"
                      className="portalFormInput"
                      value={schedForm.time}
                      onChange={(e) => setSchedForm((p) => ({ ...p, time: e.target.value }))}
                    />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">End Time <span style={{ opacity:.55 }}>(opt.)</span></label>
                    <input
                      type="time"
                      className="portalFormInput"
                      value={schedForm.endTime}
                      onChange={(e) => setSchedForm((p) => ({ ...p, endTime: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="portalFormField">
                  <label className="portalFormLabel">Work / Service Scheduled</label>
                  <input
                    type="text"
                    className="portalFormInput"
                    placeholder="e.g. Brake inspection and front pad replacement"
                    value={schedForm.service}
                    onChange={(e) => setSchedForm((p) => ({ ...p, service: e.target.value }))}
                  />
                </div>

                {schedError && (
                  <p style={{ color: "var(--p-red)", fontSize: ".82rem", margin: "4px 0 0" }}>{schedError}</p>
                )}

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" }}>
                  <button
                    className="portalBtn portalBtnSecondary"
                    onClick={handleScheduleSave}
                    disabled={scheduling || !schedForm.date}
                  >
                    {scheduling ? "Saving…" : "Save Scheduling Details"}
                  </button>
                  <button
                    className="portalBtn portalBtnPrimary"
                    onClick={handleConfirm}
                    disabled={scheduling || !schedForm.date || !schedForm.time || detailRequest.status === "converted"}
                    title={!schedForm.date || !schedForm.time ? "Date and start time are required to confirm" : ""}
                  >
                    <i className="fa-solid fa-circle-check"></i>{" "}
                    {detailRequest.status === "confirmed" ? "Re-Confirm" : "Confirm Appointment"}
                  </button>
                  {schedSaved && (
                    <span style={{ fontSize: ".8rem", color: "var(--p-green)", fontWeight: 600 }}>
                      <i className="fa-solid fa-check"></i> Saved
                    </span>
                  )}
                </div>
              </div>

              <hr className="apptModalDivider" />

              {/* ── 3. Reply to Customer ── */}
              <p className="apptModalSectionLabel">
                <i className="fa-solid fa-reply"></i> Reply to Customer
              </p>

              {!detailRequest.email?.trim() ? (
                <div className="apptNoEmail">
                  <i className="fa-solid fa-phone"></i>
                  No customer email on this request. Please reply by phone:&nbsp;
                  <strong>{detailRequest.phone}</strong>
                </div>
              ) : (
                <>
                  {detailRequest.replied_at && (
                    <p style={{ fontSize: ".8rem", color: "var(--p-text-3)", margin: "0 0 8px" }}>
                      <i className="fa-solid fa-clock" style={{ marginRight: 4 }}></i>
                      Last reply sent: {fmtDateTime(detailRequest.replied_at)}
                    </p>
                  )}
                  <textarea
                    className="portalFormTextarea"
                    rows={4}
                    placeholder={`Write a reply to ${detailRequest.name}…`}
                    value={replyText}
                    onChange={(e) => { setReplyText(e.target.value); setReplyResult(null); }}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                  {replyResult?.ok && (
                    <p style={{ color: "var(--p-green)", fontSize: ".82rem", margin: "6px 0 0", fontWeight: 600 }}>
                      <i className="fa-solid fa-check"></i> Reply sent to {detailRequest.email}
                    </p>
                  )}
                  {replyResult?.err && (
                    <p style={{ color: "var(--p-red)", fontSize: ".82rem", margin: "6px 0 0" }}>
                      {replyResult.err}
                    </p>
                  )}
                  <div style={{ marginTop: "8px" }}>
                    <button
                      className="portalBtn portalBtnPrimary"
                      onClick={handleSendReply}
                      disabled={replying || !replyText.trim()}
                    >
                      <i className="fa-solid fa-paper-plane"></i>{" "}
                      {replying ? "Sending…" : "Send Reply"}
                    </button>
                  </div>
                </>
              )}

              <hr className="apptModalDivider" />

              {/* ── 4. Change Status ── */}
              <p className="apptModalSectionLabel">
                <i className="fa-solid fa-arrows-rotate"></i> Change Status
              </p>
              <div className="apptStatusRow">
                {["pending", "processing", "confirmed", "cancelled"].map((s) => (
                  <button
                    key={s}
                    className={`portalBtnStatus${detailRequest.status === s ? " active" : ""}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={changingStatus || detailRequest.status === s || detailRequest.status === "converted"}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {detailRequest.confirmed_at && (
                <p style={{ fontSize: ".78rem", color: "var(--p-text-3)", margin: "6px 0 0" }}>
                  Confirmed: {fmtDateTime(detailRequest.confirmed_at)}
                </p>
              )}
              {detailRequest.cancelled_at && (
                <p style={{ fontSize: ".78rem", color: "var(--p-text-3)", margin: "6px 0 0" }}>
                  Cancelled: {fmtDateTime(detailRequest.cancelled_at)}
                </p>
              )}

            </div>{/* end modalBody */}

            {/* Modal footer */}
            <div className="portalModalFooter">
              {detailRequest.status === "converted" ? (
                <span className="portalConvertedBadge">
                  <i className="fa-solid fa-check"></i>
                  Converted{detailRequest.repair_order_id ? " → RO created" : ""}
                </span>
              ) : (
                <button
                  className="portalBtn portalBtnPrimary"
                  onClick={openConvertModal}
                  disabled={changingStatus}
                >
                  <i className="fa-solid fa-arrow-right-to-bracket"></i> Convert to RO
                </button>
              )}
              <button className="portalBtn portalBtnSecondary" onClick={closeDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Request Modal ── */}
      {addModal && (
        <div
          className="portalModalOverlay"
          onClick={(e) => e.target === e.currentTarget && closeAddModal()}
        >
          <div className="portalModalCard" role="dialog" aria-modal="true" aria-label="Add Appointment Request">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Add Appointment Request</h2>
              <button className="portalModalClose" onClick={closeAddModal} aria-label="Close">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleSave} noValidate>
              <div className="portalModalBody">
                {saveError && <div className="portalModalError">{saveError}</div>}
                <div className="portalForm">
                  <div className="portalFormField">
                    <label className="portalFormLabel">Source</label>
                    <select className="portalFormSelect" name="source" value={formData.source} onChange={handleField}>
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
                    <textarea className="portalFormTextarea" name="notes" rows={3}
                      placeholder="Customer concerns, symptoms, or anything else to note…"
                      value={formData.notes} onChange={handleField} />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary"
                  onClick={closeAddModal} disabled={saving}>Cancel</button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
                  {saving ? "Saving…" : "Save Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Convert to RO Modal ── */}
      {convertModal && detailRequest && (
        <div
          className="portalModalOverlay"
          onClick={(e) => e.target === e.currentTarget && closeConvertModal()}
        >
          <div className="portalModalCard" style={{ maxWidth: "540px" }}
            role="dialog" aria-modal="true" aria-label="Convert to Repair Order">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Convert to Repair Order</h2>
              <button className="portalModalClose" onClick={closeConvertModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleConvertSubmit} noValidate>
              <div className="portalModalBody">
                {convertError && <div className="portalModalError">{convertError}</div>}
                <div style={{ padding:"12px 14px", background:"var(--p-bg)", border:"1px solid var(--p-border)", borderRadius:"var(--p-radius-sm)", marginBottom:"18px", fontSize:".85rem" }}>
                  <strong>{detailRequest.name}</strong> — {detailRequest.phone}
                  {detailRequest.service_requested && <> &nbsp;|&nbsp; {detailRequest.service_requested}</>}
                  {detailRequest.preferred_date && (
                    <div style={{ color:"var(--p-text-2)", marginTop:"2px" }}>Preferred: {detailRequest.preferred_date}</div>
                  )}
                </div>
                <div className="portalForm">
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
                      Not listed? <a href="/portal/customers" style={{ color:"var(--p-navy)", fontWeight:600 }}>Create in Customers first.</a>
                    </p>
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Vehicle<span className="req">*</span></label>
                    {!convertForm.customer_id ? (
                      <p className="portalSelectorNote">Select a customer first.</p>
                    ) : convertVehicles.length === 0 ? (
                      <p className="portalSelectorNote">
                        No vehicles on file.
                        <a href="/portal/customers" style={{ color:"var(--p-navy)", marginLeft:6, fontWeight:600 }}>Add one from Customers.</a>
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
                      <label className="portalFormLabel">Mileage In (km)</label>
                      <input className="portalFormInput" type="number" name="mileage_in"
                        placeholder="e.g. 87500" value={convertForm.mileage_in} onChange={handleConvertField} />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Promised Date</label>
                      <input className="portalFormInput" type="date" name="promised_date"
                        value={convertForm.promised_date} onChange={handleConvertField} />
                    </div>
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Customer Concern</label>
                    <textarea className="portalFormTextarea" name="customer_concern" rows={2}
                      value={convertForm.customer_concern} onChange={handleConvertField} />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Internal Notes</label>
                    <textarea className="portalFormTextarea" name="internal_notes" rows={2}
                      placeholder="Staff-only notes…"
                      value={convertForm.internal_notes} onChange={handleConvertField} />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary"
                  onClick={closeConvertModal} disabled={converting}>Cancel</button>
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

/* ── Small reusable field for Add Request modal ── */
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

/* ── Info field for detail modal ── */
function InfoField({ label, value }) {
  return (
    <div>
      <div className="portalDetailLabel">{label}</div>
      <div className={`portalDetailValue${!value ? " empty" : ""}`}>
        {value || "Not provided"}
      </div>
    </div>
  );
}

/* ── Month calendar (shows only scheduled appointments) ─────── */
function AppCalendar({ scheduledRequests, calMonth, onMonthNav, onSelect, selected, loading, error, onRetry }) {
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  const now      = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  /* Group requests by LOCAL date of scheduled_start */
  const byDate = {};
  scheduledRequests.forEach((r) => {
    const d   = new Date(r.scheduled_start);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r);
  });

  /* Build 7-column grid */
  const firstDow   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const prevYear    = month === 0 ? year - 1 : year;
  const prevMonth   = month === 0 ? 11 : month - 1;
  const nextYear    = month === 11 ? year + 1 : year;
  const nextMonth   = month === 11 ? 0 : month + 1;

  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, y: prevYear,  m: prevMonth,  other: true });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, y: year, m: month, other: false });
  let nd = 1;
  while (cells.length % 7 !== 0)
    cells.push({ day: nd++, y: nextYear, m: nextMonth, other: true });

  const hasThisMonth = scheduledRequests.some((r) => {
    const d = new Date(r.scheduled_start);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (loading) return (
    <div className="apptCal">
      <CalNav year={year} month={month} onMonthNav={onMonthNav} />
      <div className="apptCalEmpty"><p style={{ color: "var(--p-text-3)" }}>Loading…</p></div>
    </div>
  );

  if (error) return (
    <div className="apptCal">
      <CalNav year={year} month={month} onMonthNav={onMonthNav} />
      <div className="apptCalEmpty">
        <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⚠️</div>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Could not load appointments</p>
        <button className="portalBtn portalBtnSecondary" onClick={onRetry}>Try Again</button>
      </div>
    </div>
  );

  return (
    <div className="apptCal">
      <CalNav year={year} month={month} onMonthNav={onMonthNav} />

      <div className="apptCalWeekRow">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="apptCalWeekLabel">{d}</div>
        ))}
      </div>

      <div className="apptCalGrid">
        {cells.map((cell, i) => {
          const key      = `${cell.y}-${cell.m}-${cell.day}`;
          const isToday  = !cell.other && key === todayKey;
          const dayAppts = cell.other ? [] : (byDate[key] || []);
          const visible  = dayAppts.slice(0, 3);
          const overflow = dayAppts.length - visible.length;

          return (
            <div
              key={i}
              className={["apptCalCell", cell.other ? "otherMonth" : "", isToday ? "today" : ""].filter(Boolean).join(" ")}
            >
              <div className="apptCalDayNum">{cell.day}</div>
              {visible.map((r) => {
                const timeLabel = fmtTime(r.scheduled_start);
                const svc       = r.scheduled_service || r.service_requested;
                return (
                  <button
                    key={r.id}
                    className={[
                      "apptCalEvent",
                      `status-${r.status}`,
                      selected?.id === r.id ? "selected" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => onSelect(r)}
                    title={`${r.name}${svc ? " — " + svc : ""}${timeLabel ? " · " + timeLabel : ""}`}
                  >
                    {timeLabel && <span className="apptCalEventTime">{timeLabel} </span>}
                    {r.name}
                    {svc && <span className="apptCalEventSub"> · {svc}</span>}
                  </button>
                );
              })}
              {overflow > 0 && <div className="apptCalMore">+{overflow} more</div>}
            </div>
          );
        })}
      </div>

      {!hasThisMonth && (
        <div className="apptCalEmpty">
          <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "1.6rem", display: "block", marginBottom: 10, opacity: .25 }}></i>
          No scheduled appointments for {MONTH_NAMES[month]} {year}.
          <span style={{ display: "block", fontSize: ".8rem", marginTop: 6, opacity: .7 }}>
            Schedule a request from the list below.
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Calendar navigation bar ── */
function CalNav({ year, month, onMonthNav }) {
  return (
    <div className="apptCalNav">
      <div className="apptCalNavBtns">
        <button className="apptCalNavBtn" onClick={() => onMonthNav(-1)} aria-label="Previous month">
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <button className="apptCalNavBtn" onClick={() => onMonthNav(0)}>Today</button>
        <button className="apptCalNavBtn" onClick={() => onMonthNav(1)} aria-label="Next month">
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <span className="apptCalNavTitle">{MONTH_NAMES[month]} {year}</span>
      <span className="apptCalNavNote">
        <i className="fa-solid fa-circle-info" style={{ marginRight: 4, opacity: .6 }}></i>
        Confirmed &amp; scheduled appointments only
      </span>
    </div>
  );
}
