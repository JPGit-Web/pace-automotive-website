import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import { supabase } from "../../lib/supabase";
import {
  listRepairOrders, getRepairOrder, createRepairOrder,
  updateRepairOrder, updateRepairOrderStatus,
  listCustomers, createCustomer, listVehiclesByCustomer, createVehicle, logActivity,
  getInspectionByRepairOrder, createInspectionForRepairOrder, createDefaultInspectionItems,
  getEstimateByRepairOrder, createEstimateForRepairOrder,
  getHelcimInvoiceByRepairOrder, createManualHelcimInvoice,
  listRepairOrderConcerns, bulkCreateRepairOrderConcerns,
  createRepairOrderConcern, updateRepairOrderConcern, softHideRepairOrderConcern,
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
  // Inline new customer (Part A)
  const [showInlineCust,  setShowInlineCust]  = useState(false);
  const [newCustForm,     setNewCustForm]     = useState({ first_name:"",last_name:"",phone:"",email:"",province:"AB",notes:"" });
  const [newCustErrors,   setNewCustErrors]   = useState({});
  const [newCustSaving,   setNewCustSaving]   = useState(false);
  // Inline new vehicle (Part A extended)
  const [showInlineVeh,   setShowInlineVeh]   = useState(false);
  const [newVehForm,      setNewVehForm]      = useState({ year:"",make:"",model:"",trim:"",color:"",vin:"",license_plate:"",plate_province:"AB",notes:"" });
  const [newVehErrors,    setNewVehErrors]    = useState({});
  const [newVehSaving,    setNewVehSaving]    = useState(false);
  // Concerns — create modal (Part B)
  const [createConcerns,  setCreateConcerns]  = useState([{ id:"c0", text:"" }]);
  // Concerns — edit modal (Part B)
  const [editConcerns,    setEditConcerns]    = useState([]); // { id, text, isNew, hidden }
  // Concerns — detail view (Part B)
  const [roConcerns,      setRoConcerns]      = useState([]);
  // Inspection state for current RO
  const [roInspection,    setRoInspection]    = useState(null);
  const [inspLoading,     setInspLoading]     = useState(false);
  // Estimate state for current RO
  const [roEstimate,      setRoEstimate]      = useState(null);
  const [estLoading,      setEstLoading]      = useState(false);
  // Invoice state for current RO
  const [roInvoice,       setRoInvoice]       = useState(null);
  const [invLoading,      setInvLoading]      = useState(false);
  // History counts for the compact strip (Part D)
  const [historyCounts,   setHistoryCounts]   = useState(null);
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
    if (selected?.id === ro.id) return; // modal already open for this RO
    setSelected(ro);
    setDetailLoading(true);
    setRoInspection(null);
    setRoEstimate(null);
    setRoInvoice(null);
    setHistoryCounts(null);
    try {
      // ro.customers.id and ro.vehicles.id come from the list select
      const custId = ro.customers?.id ?? null;
      const vehId  = ro.vehicles?.id  ?? null;

      const [detail, insp, est, inv, concerns, custCountRes, vehCountRes] = await Promise.all([
        getRepairOrder(ro.id),
        getInspectionByRepairOrder(ro.id).catch(() => null),
        getEstimateByRepairOrder(ro.id).catch(() => null),
        getHelcimInvoiceByRepairOrder(ro.id).catch(() => null),
        listRepairOrderConcerns(ro.id).catch(() => []),
        custId
          ? supabase.from("repair_orders").select("id", { count: "exact", head: true })
              .eq("customer_id", custId).neq("id", ro.id)
          : Promise.resolve({ count: 0 }),
        vehId
          ? supabase.from("repair_orders").select("id", { count: "exact", head: true })
              .eq("vehicle_id", vehId).neq("id", ro.id)
          : Promise.resolve({ count: 0 }),
      ]);
      setDetailData(detail);
      setRoInspection(insp);
      setRoEstimate(est);
      setRoInvoice(inv);
      setHistoryCounts({
        customer: custCountRes?.count ?? 0,
        vehicle:  vehCountRes?.count  ?? 0,
      });
      // Fall back to customer_concern if no structured rows yet
      if (concerns.length > 0) {
        setRoConcerns(concerns);
      } else if (detail?.customer_concern) {
        setRoConcerns([{ id: null, concern_text: detail.customer_concern }]);
      } else {
        setRoConcerns([]);
      }
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

  function closeRODetail() {
    setSelected(null);
    setDetailData(null);
    setHistoryCounts(null);
    setRoConcerns([]);
    setRoInspection(null);
    setRoEstimate(null);
    setRoInvoice(null);
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
    setCreateConcerns([{ id: "c0", text: "" }]);
    setShowInlineCust(false);
    setNewCustForm({ first_name:"",last_name:"",phone:"",email:"",province:"AB",notes:"" });
    setNewCustErrors({});
    setShowInlineVeh(false);
    setNewVehForm({ year:"",make:"",model:"",trim:"",color:"",vin:"",license_plate:"",plate_province:"AB",notes:"" });
    setNewVehErrors({});
    setModal("create");
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
    // Populate edit concerns from loaded roConcerns
    if (roConcerns.length > 0) {
      setEditConcerns(roConcerns.map((c) => ({
        id: c.id, text: c.concern_text ?? "", isNew: false, hidden: false,
      })));
    } else {
      setEditConcerns([{ id: `new-${Date.now()}`, text: "", isNew: true, hidden: false }]);
    }
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
    setShowInlineVeh(false);
    setNewVehErrors({});
    if (!id) return;
    try { setCustVehicles(await listVehiclesByCustomer(id)); }
    catch { setCustVehicles([]); }
  }

  /* ── Inline new customer (Part A) ── */
  function handleNewCustField(e) {
    const { name, value } = e.target;
    setNewCustForm((p) => ({ ...p, [name]: value }));
    if (newCustErrors[name]) setNewCustErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleCreateInlineCustomer() {
    const errors = {};
    if (!newCustForm.first_name.trim() && !newCustForm.last_name.trim())
      errors.name = "Enter at least a first or last name.";
    if (newCustForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustForm.email.trim()))
      errors.email = "Enter a valid email.";
    if (Object.keys(errors).length) { setNewCustErrors(errors); return; }

    setNewCustSaving(true);
    try {
      const payload = {
        first_name:        newCustForm.first_name.trim() || null,
        last_name:         newCustForm.last_name.trim()  || null,
        phone:             newCustForm.phone.trim()      || null,
        email:             newCustForm.email.trim()      || null,
        notes:             newCustForm.notes.trim()      || null,
        province:          newCustForm.province          || "AB",  // required NOT NULL
        preferred_contact: "phone",
      };
      const newCust = await createCustomer(payload);
      await logActivity("customer.created", "customer", newCust.id, {
        name: `${newCust.first_name ?? ""} ${newCust.last_name ?? ""}`.trim(),
        from: "inline_ro_create",
      });
      // Refresh customer list and auto-select the new customer
      const updated = await listCustomers();
      setAllCustomers(updated);
      setFormData((p) => ({ ...p, customer_id: newCust.id, vehicle_id: "" }));
      setCustVehicles([]);
      setShowInlineCust(false);
      setNewCustForm({ first_name:"",last_name:"",phone:"",email:"",province:"AB",notes:"" });
      setNewCustErrors({});
    } catch (err) {
      const msg = err?.message?.includes("not-null")
        ? "A required field is missing. Check all fields and try again."
        : err?.message ?? "Failed to create customer. Please try again.";
      setNewCustErrors({ name: msg });
    } finally {
      setNewCustSaving(false);
    }
  }

  /* ── Inline new vehicle ── */
  function handleNewVehField(e) {
    const { name, value } = e.target;
    setNewVehForm((p) => ({ ...p, [name]: value }));
    if (newVehErrors[name]) setNewVehErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleCreateInlineVehicle() {
    const errors = {};
    if (!formData.customer_id) {
      errors.general = "Select a customer before adding a vehicle.";
    }
    if (!newVehForm.make.trim())  errors.make  = "Make is required.";
    if (!newVehForm.model.trim()) errors.model = "Model is required.";
    if (newVehForm.year && (isNaN(+newVehForm.year) || +newVehForm.year < 1900 || +newVehForm.year > 2100))
      errors.year = "Year must be between 1900 and 2100.";
    if (newVehForm.vin.trim() && newVehForm.vin.trim().length > 17)
      errors.vin = "VIN must be 17 characters or less.";
    if (Object.keys(errors).length) { setNewVehErrors(errors); return; }

    setNewVehSaving(true);
    try {
      const veh = await createVehicle({
        customer_id:    formData.customer_id,
        year:           newVehForm.year ? parseInt(newVehForm.year, 10) : null,
        make:           newVehForm.make.trim(),
        model:          newVehForm.model.trim(),
        trim:           newVehForm.trim.trim()           || null,
        color:          newVehForm.color.trim()          || null,
        vin:            newVehForm.vin.trim()             || null,
        license_plate:  newVehForm.license_plate.trim()  || null,
        plate_province: newVehForm.plate_province        || "AB",
        notes:          newVehForm.notes.trim()          || null,
      });
      await logActivity("vehicle.created", "vehicle", veh.id, {
        make: veh.make, model: veh.model, from: "inline_ro_create",
      });
      // Refresh vehicle list and auto-select the new vehicle
      const updated = await listVehiclesByCustomer(formData.customer_id);
      setCustVehicles(updated);
      setFormData((p) => ({ ...p, vehicle_id: veh.id }));
      setShowInlineVeh(false);
      setNewVehForm({ year:"",make:"",model:"",trim:"",color:"",vin:"",license_plate:"",plate_province:"AB",notes:"" });
      setNewVehErrors({});
    } catch (err) {
      const msg = err?.message?.includes("not-null")
        ? "A required field is missing. Check all fields and try again."
        : err?.message ?? "Failed to create vehicle. Please try again.";
      setNewVehErrors({ general: msg });
    } finally {
      setNewVehSaving(false);
    }
  }

  /* ── Concern helpers (Part B) ── */
  function addCreateConcern() {
    setCreateConcerns((p) => [...p, { id: `c${Date.now()}`, text: "" }]);
  }
  function removeCreateConcern(id) {
    setCreateConcerns((p) => p.length > 1 ? p.filter((c) => c.id !== id) : p);
  }
  function updateCreateConcern(id, text) {
    setCreateConcerns((p) => p.map((c) => c.id === id ? { ...c, text } : c));
  }

  function addEditConcern() {
    setEditConcerns((p) => [...p, { id: `new-${Date.now()}`, text: "", isNew: true, hidden: false }]);
  }
  function hideEditConcern(id) {
    setEditConcerns((p) => p.map((c) => c.id === id ? { ...c, hidden: true } : c));
  }
  function updateEditConcern(id, text) {
    setEditConcerns((p) => p.map((c) => c.id === id ? { ...c, text } : c));
  }

  /* ── Save create ── */
  async function handleCreate(e) {
    e.preventDefault();
    const errors = validateCreate(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setSaving(true); setSaveError("");
    try {
      const activeConcerns = createConcerns.map((c) => c.text.trim()).filter(Boolean);
      const firstConcern   = activeConcerns[0] ?? null;
      const ro = await createRepairOrder({
        ...formData,
        mileage_in:       formData.mileage_in ? parseInt(formData.mileage_in, 10) : null,
        customer_concern: firstConcern, // backwards compat
      });
      // Save structured concern rows
      if (activeConcerns.length > 0) {
        await bulkCreateRepairOrderConcerns(ro.id, activeConcerns).catch(() => {});
      }
      await logActivity("repair_order.created", "repair_order", ro.id, {
        ro_number: ro.ro_number, concern_count: activeConcerns.length,
      });
      closeModal();
      await load();
      setSelected(ro);
      const detail = await getRepairOrder(ro.id);
      setDetailData(detail);
      const concerns = await listRepairOrderConcerns(ro.id).catch(() => []);
      setRoConcerns(concerns.length > 0 ? concerns
        : (detail?.customer_concern ? [{ id: null, concern_text: detail.customer_concern }] : []));
    } catch { setSaveError("Failed to create repair order. Please try again."); }
    finally { setSaving(false); }
  }

  /* ── Save edit ── */
  async function handleEdit(e) {
    e.preventDefault();
    setSaving(true); setSaveError("");
    try {
      const activeConcerns = editConcerns.filter((c) => !c.hidden && c.text.trim());
      const firstConcern   = activeConcerns[0]?.text.trim() ?? null;

      const updated = await updateRepairOrder(selected.id, {
        ...formData,
        mileage_in:       formData.mileage_in  ? parseInt(formData.mileage_in, 10)  : null,
        mileage_out:      formData.mileage_out ? parseInt(formData.mileage_out, 10) : null,
        customer_concern: firstConcern,
      });

      // Process concern changes
      for (const c of editConcerns) {
        if (c.hidden && !c.isNew && c.id) {
          await softHideRepairOrderConcern(c.id).catch(() => {});
        } else if (c.isNew && !c.hidden && c.text.trim()) {
          await createRepairOrderConcern(selected.id, {
            concern_text: c.text.trim(),
            sort_order: editConcerns.indexOf(c),
          }).catch(() => {});
        } else if (!c.isNew && !c.hidden && c.id && c.text.trim()) {
          // Update existing if text changed
          const original = roConcerns.find((r) => r.id === c.id);
          if (original && original.concern_text !== c.text.trim()) {
            await updateRepairOrderConcern(c.id, { concern_text: c.text.trim() }).catch(() => {});
          }
        }
      }

      await logActivity("repair_order.updated", "repair_order", selected.id, {
        ro_number: selected.ro_number,
      });

      // Refresh concerns in detail view
      const freshConcerns = await listRepairOrderConcerns(selected.id).catch(() => []);
      setRoConcerns(freshConcerns.length > 0 ? freshConcerns
        : (firstConcern ? [{ id: null, concern_text: firstConcern }] : []));

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

      {/* RO Detail Modal */}
      {selected && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && closeRODetail()}>
          <div className="portalModalCard portalModalLg" role="dialog" aria-modal="true" aria-label={`Repair Order ${selected.ro_number}`}>
            <div className="portalModalHeader">
              <div>
                <h2 className="portalModalTitle" style={{ fontFamily:"monospace", letterSpacing:".5px" }}>{selected.ro_number}</h2>
                <div className="portalROBadges" style={{ marginTop:4 }}>
                  <span className={`portalBadge ${statusClass(selected.status)}`}>
                    {RO_STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                  <span className={`portalBadge ${selected.payment_status}`}>
                    {PAYMENT_LABELS[selected.payment_status] ?? selected.payment_status}
                  </span>
                  <span style={{ fontSize:".75rem", color:"var(--p-text-3)" }}>
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
                <button className="portalModalClose" onClick={closeRODetail}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
            <div className="portalModalBody">

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

              {/* Compact customer/vehicle history strip */}
              {historyCounts && (historyCounts.customer > 0 || historyCounts.vehicle > 0) && (
                <div className="portalHistoryStrip">
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: "var(--p-text-3)", fontSize: ".82rem" }}></i>
                  {historyCounts.customer > 0 && (
                    <span className="portalHistoryStripItem">
                      <span className="portalHistoryStripCount">{historyCounts.customer}</span>
                      other repair order{historyCounts.customer !== 1 ? "s" : ""} for this customer
                      <button
                        className="portalHistoryLinkBtn"
                        onClick={() => navigate("/portal/customers")}
                        style={{ marginLeft: 4 }}
                      >
                        Customer History
                      </button>
                    </span>
                  )}
                  {historyCounts.customer > 0 && historyCounts.vehicle > 0 && (
                    <span style={{ color: "var(--p-border)" }}>|</span>
                  )}
                  {historyCounts.vehicle > 0 && (
                    <span className="portalHistoryStripItem">
                      <span className="portalHistoryStripCount">{historyCounts.vehicle}</span>
                      other repair order{historyCounts.vehicle !== 1 ? "s" : ""} for this vehicle
                      <button
                        className="portalHistoryLinkBtn"
                        onClick={() => navigate("/portal/vehicles")}
                        style={{ marginLeft: 4 }}
                      >
                        Vehicle History
                      </button>
                    </span>
                  )}
                </div>
              )}

              {/* 3-C fields — Customer Concerns use structured rows */}
              <div className="portalRODetailSection">
                <p className="portalROSectionTitle">Job Details</p>

                {/* Customer Concerns (multi-row) */}
                <div style={{ marginBottom:"12px" }}>
                  <div className="portalDetailLabel" style={{ marginBottom:"6px" }}>
                    Customer Concerns
                    {roConcerns.length > 1 && (
                      <span style={{ marginLeft:6, fontSize:".7rem", color:"var(--p-text-3)" }}>
                        ({roConcerns.length})
                      </span>
                    )}
                  </div>
                  {roConcerns.length === 0 ? (
                    <div className="portalROTextField empty">Not provided</div>
                  ) : (
                    <div className="portalConcernDetail">
                      {roConcerns.map((c, i) => (
                        <div key={c.id ?? i} className="portalConcernDetailItem">
                          {roConcerns.length > 1 && (
                            <span className="portalConcernDetailNum">{i + 1}.</span>
                          )}
                          <span>{c.concern_text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                  {[["Cause",           detailData.cause],
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
            </div>{/* portalModalBody */}
          </div>{/* portalModalCard */}
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
                  {/* Customer + inline new customer */}
                  <div className="portalFormField">
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <label className="portalFormLabel" style={{ margin:0 }}>Customer<span className="req">*</span></label>
                      {!showInlineCust && (
                        <button type="button"
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:".78rem", fontWeight:600, color:"var(--p-navy)", fontFamily:"inherit", padding:"0 2px" }}
                          onClick={() => setShowInlineCust(true)}>
                          <i className="fa-solid fa-plus" style={{ marginRight:4 }}></i>New Customer
                        </button>
                      )}
                    </div>
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

                    {/* Inline new customer sub-form */}
                    {showInlineCust && (
                      <div className="portalInlineCustForm">
                        <p className="portalInlineCustTitle">
                          <i className="fa-solid fa-user-plus" style={{ color:"var(--p-navy)" }}></i>
                          New Customer
                        </p>
                        {newCustErrors.name && <div className="portalModalError" style={{ marginBottom:8 }}>{newCustErrors.name}</div>}
                        <div className="portalFormRow">
                          <div className="portalFormField">
                            <label className="portalFormLabel">First Name</label>
                            <input className="portalFormInput" type="text" name="first_name"
                              value={newCustForm.first_name} onChange={handleNewCustField} placeholder="First" autoFocus />
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Last Name</label>
                            <input className="portalFormInput" type="text" name="last_name"
                              value={newCustForm.last_name} onChange={handleNewCustField} placeholder="Last" />
                          </div>
                        </div>
                        <div className="portalFormRow">
                          <div className="portalFormField">
                            <label className="portalFormLabel">Phone</label>
                            <input className="portalFormInput" type="tel" name="phone"
                              value={newCustForm.phone} onChange={handleNewCustField} />
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Email</label>
                            <input className={`portalFormInput${newCustErrors.email ? " invalid" : ""}`}
                              type="email" name="email"
                              value={newCustForm.email} onChange={handleNewCustField} />
                            {newCustErrors.email && <p className="portalFormFieldError">{newCustErrors.email}</p>}
                          </div>
                        </div>
                        <div className="portalFormField">
                          <label className="portalFormLabel">Province</label>
                          <select className="portalFormSelect" name="province"
                            value={newCustForm.province} onChange={handleNewCustField}>
                            {["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"].map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
                          <button type="button" className="portalBtn portalBtnPrimary"
                            style={{ fontSize:".82rem", padding:"8px 16px" }}
                            onClick={handleCreateInlineCustomer} disabled={newCustSaving}>
                            {newCustSaving ? "Creating…" : "Create & Select"}
                          </button>
                          <button type="button" className="portalBtn portalBtnSecondary"
                            style={{ fontSize:".82rem", padding:"8px 16px" }}
                            onClick={() => { setShowInlineCust(false); setNewCustErrors({}); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vehicle + inline new vehicle */}
                  <div className="portalFormField">
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <label className="portalFormLabel" style={{ margin:0 }}>Vehicle<span className="req">*</span></label>
                      {formData.customer_id && !showInlineVeh && (
                        <button type="button"
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:".78rem", fontWeight:600, color:"var(--p-navy)", fontFamily:"inherit", padding:"0 2px" }}
                          onClick={() => setShowInlineVeh(true)}>
                          <i className="fa-solid fa-plus" style={{ marginRight:4 }}></i>New Vehicle
                        </button>
                      )}
                    </div>
                    {!formData.customer_id ? (
                      <p className="portalSelectorNote">Select or create a customer first.</p>
                    ) : custVehicles.length === 0 && !showInlineVeh ? (
                      <p className="portalSelectorNote">
                        No vehicles on file.
                        <button type="button"
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:".82rem", fontWeight:600, color:"var(--p-navy)", fontFamily:"inherit", marginLeft:6, padding:0 }}
                          onClick={() => setShowInlineVeh(true)}>
                          + Add a vehicle now
                        </button>
                      </p>
                    ) : !showInlineVeh ? (
                      <select className={`portalFormSelect${formErrors.vehicle_id ? " invalid" : ""}`}
                        name="vehicle_id" value={formData.vehicle_id} onChange={handleField}>
                        <option value="">— Select vehicle —</option>
                        {custVehicles.map((v) => (
                          <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(" ")}{v.license_plate ? ` — ${v.license_plate}` : ""}</option>
                        ))}
                      </select>
                    ) : null}
                    {formErrors.vehicle_id && <p className="portalFormFieldError">{formErrors.vehicle_id}</p>}

                    {/* Inline new vehicle sub-form */}
                    {showInlineVeh && (
                      <div className="portalInlineCustForm">
                        <p className="portalInlineCustTitle">
                          <i className="fa-solid fa-car" style={{ color:"var(--p-navy)" }}></i>
                          New Vehicle
                        </p>
                        {newVehErrors.general && <div className="portalModalError" style={{ marginBottom:8 }}>{newVehErrors.general}</div>}
                        <div className="portalFormRow">
                          <div className="portalFormField">
                            <label className="portalFormLabel">Year</label>
                            <input className={`portalFormInput${newVehErrors.year ? " invalid" : ""}`}
                              type="number" name="year" min="1900" max="2100"
                              value={newVehForm.year} onChange={handleNewVehField} placeholder="e.g. 2019" autoFocus />
                            {newVehErrors.year && <p className="portalFormFieldError">{newVehErrors.year}</p>}
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Color</label>
                            <input className="portalFormInput" type="text" name="color"
                              value={newVehForm.color} onChange={handleNewVehField} placeholder="e.g. White" />
                          </div>
                        </div>
                        <div className="portalFormRow">
                          <div className="portalFormField">
                            <label className="portalFormLabel">Make<span className="req">*</span></label>
                            <input className={`portalFormInput${newVehErrors.make ? " invalid" : ""}`}
                              type="text" name="make"
                              value={newVehForm.make} onChange={handleNewVehField} placeholder="e.g. Toyota" />
                            {newVehErrors.make && <p className="portalFormFieldError">{newVehErrors.make}</p>}
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Model<span className="req">*</span></label>
                            <input className={`portalFormInput${newVehErrors.model ? " invalid" : ""}`}
                              type="text" name="model"
                              value={newVehForm.model} onChange={handleNewVehField} placeholder="e.g. Camry" />
                            {newVehErrors.model && <p className="portalFormFieldError">{newVehErrors.model}</p>}
                          </div>
                        </div>
                        <div className="portalFormRow">
                          <div className="portalFormField">
                            <label className="portalFormLabel">License Plate</label>
                            <input className="portalFormInput" type="text" name="license_plate"
                              value={newVehForm.license_plate} onChange={handleNewVehField} placeholder="e.g. ABC 1234" />
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Province</label>
                            <select className="portalFormSelect" name="plate_province"
                              value={newVehForm.plate_province} onChange={handleNewVehField}>
                              {["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"].map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="portalFormField">
                          <label className="portalFormLabel">VIN <span style={{ fontSize:".72rem", color:"var(--p-text-3)", fontWeight:400 }}>(optional, max 17 chars)</span></label>
                          <input className={`portalFormInput${newVehErrors.vin ? " invalid" : ""}`}
                            type="text" name="vin"
                            value={newVehForm.vin} onChange={handleNewVehField} />
                          {newVehErrors.vin && <p className="portalFormFieldError">{newVehErrors.vin}</p>}
                        </div>
                        <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
                          <button type="button" className="portalBtn portalBtnPrimary"
                            style={{ fontSize:".82rem", padding:"8px 16px" }}
                            onClick={handleCreateInlineVehicle} disabled={newVehSaving}>
                            {newVehSaving ? "Adding…" : "Add & Select Vehicle"}
                          </button>
                          <button type="button" className="portalBtn portalBtnSecondary"
                            style={{ fontSize:".82rem", padding:"8px 16px" }}
                            onClick={() => { setShowInlineVeh(false); setNewVehErrors({}); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="portalFormRow">
                    <Field label="Mileage In (km)" name="mileage_in" type="number"
                      error={formErrors.mileage_in} value={formData.mileage_in} onChange={handleField} placeholder="e.g. 87500" />
                    <Field label="Promised Date" name="promised_date" type="date"
                      value={formData.promised_date} onChange={handleField} />
                  </div>

                  {/* Multi-concern list */}
                  <div className="portalFormField">
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <label className="portalFormLabel" style={{ margin:0 }}>Customer Concerns</label>
                      <button type="button"
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:".78rem", fontWeight:600, color:"var(--p-navy)", fontFamily:"inherit", padding:"0 2px" }}
                        onClick={addCreateConcern}>
                        <i className="fa-solid fa-plus" style={{ marginRight:4 }}></i>Add Concern
                      </button>
                    </div>
                    <div className="portalConcernList">
                      {createConcerns.map((c, i) => (
                        <div key={c.id} className="portalConcernRow">
                          {createConcerns.length > 1 && (
                            <span className="portalConcernNumber">{i + 1}.</span>
                          )}
                          <input className="portalFormInput" type="text"
                            placeholder={i === 0 ? "What did the customer report?" : `Concern ${i + 1}…`}
                            value={c.text}
                            onChange={(e) => updateCreateConcern(c.id, e.target.value)} />
                          {createConcerns.length > 1 && (
                            <button type="button" className="portalBtnIcon danger"
                              onClick={() => removeCreateConcern(c.id)} title="Remove concern">
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
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
                  {/* Multi-concern list in edit modal */}
                  <div className="portalFormField">
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <label className="portalFormLabel" style={{ margin:0 }}>Customer Concerns</label>
                      <button type="button"
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:".78rem", fontWeight:600, color:"var(--p-navy)", fontFamily:"inherit", padding:"0 2px" }}
                        onClick={addEditConcern}>
                        <i className="fa-solid fa-plus" style={{ marginRight:4 }}></i>Add Concern
                      </button>
                    </div>
                    <div className="portalConcernList">
                      {editConcerns.filter((c) => !c.hidden).map((c, i) => (
                        <div key={c.id} className="portalConcernRow">
                          <input className="portalFormInput" type="text"
                            placeholder={`Concern ${i + 1}…`}
                            value={c.text}
                            onChange={(e) => updateEditConcern(c.id, e.target.value)} />
                          <button type="button" className="portalBtnIcon danger"
                            onClick={() => hideEditConcern(c.id)} title="Remove concern">
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                      ))}
                      {editConcerns.filter((c) => !c.hidden).length === 0 && (
                        <p style={{ fontSize:".82rem", color:"var(--p-text-3)", margin:0 }}>No concerns. Click Add Concern.</p>
                      )}
                    </div>
                  </div>

                  {[
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
