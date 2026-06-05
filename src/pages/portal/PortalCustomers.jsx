import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listCustomers, createCustomer, updateCustomer, softDeleteCustomer,
  listVehiclesByCustomer, createVehicle, updateVehicle, softDeleteVehicle,
  logActivity, getCustomerServiceHistory,
} from "../../lib/portalData";

/* ── Constants ─────────────────────────────────────────────── */
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
const CONTACT_OPTIONS = [
  { value: "phone",         label: "Phone" },
  { value: "email",         label: "Email" },
  { value: "text",          label: "Text" },
  { value: "email_and_text",label: "Email & Text" },
];

const EMPTY_CUSTOMER = {
  first_name: "", last_name: "", email: "", phone: "",
  preferred_contact: "phone",
  address: "", city: "", province: "AB", postal_code: "", notes: "",
};

const EMPTY_VEHICLE = {
  year: "", make: "", model: "", trim: "", color: "",
  vin: "", license_plate: "", plate_province: "AB", notes: "",
};

/* ── Validation ─────────────────────────────────────────────── */
function validateCustomer(d) {
  const e = {};
  if (!d.first_name?.trim()) e.first_name = "First name is required.";
  if (!d.last_name?.trim())  e.last_name  = "Last name is required.";
  if (d.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
    e.email = "Enter a valid email address.";
  return e;
}

function validateVehicle(d) {
  const e = {};
  if (!d.make?.trim())  e.make  = "Make is required.";
  if (!d.model?.trim()) e.model = "Model is required.";
  if (d.year) {
    const yr = parseInt(d.year, 10);
    if (isNaN(yr) || yr < 1900 || yr > 2100)
      e.year = "Year must be between 1900 and 2100.";
  }
  if (d.vin?.trim() && d.vin.trim().length > 17)
    e.vin = "VIN must be 17 characters or less.";
  return e;
}

/* ── Helpers ────────────────────────────────────────────────── */
const fullName = (c) => `${c.first_name} ${c.last_name}`;
const vehicleLabel = (v) =>
  [v.year, v.make, v.model].filter(Boolean).join(" ");

const contactLabel = (val) =>
  CONTACT_OPTIONS.find((o) => o.value === val)?.label ?? val;

/* ============================================================ */
export default function PortalCustomers() {
  /* ── State ── */
  const [view,             setView]             = useState("list");   // 'list' | 'detail'
  const [customers,        setCustomers]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [search,           setSearch]           = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerVehicles, setCustomerVehicles] = useState([]);
  const [vehiclesLoading,  setVehiclesLoading]  = useState(false);
  const [modal,            setModal]            = useState(null);   // { type, mode, data }
  const [formData,         setFormData]         = useState({});
  const [formErrors,       setFormErrors]       = useState({});
  const [saving,           setSaving]           = useState(false);
  const [saveError,        setSaveError]        = useState("");
  const [history,          setHistory]          = useState(null);
  const [historyLoading,   setHistoryLoading]   = useState(false);

  /* ── Load customers ── */
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await listCustomers());
    } catch {
      setError("Failed to load customers. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  /* ── Load vehicles for selected customer ── */
  const loadVehicles = useCallback(async (customerId) => {
    setVehiclesLoading(true);
    try {
      setCustomerVehicles(await listVehiclesByCustomer(customerId));
    } catch {
      setCustomerVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  /* ── Load service history for selected customer ── */
  const loadHistory = useCallback(async (customerId) => {
    setHistoryLoading(true);
    setHistory(null);
    try {
      setHistory(await getCustomerServiceHistory(customerId));
    } catch {
      setHistory({ error: true });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /* ── Navigation ── */
  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    setView("detail");
    loadVehicles(customer.id);
    loadHistory(customer.id);
  }

  function backToList() {
    setSelectedCustomer(null);
    setCustomerVehicles([]);
    setHistory(null);
    setView("list");
  }

  /* ── Modal helpers ── */
  function openModal(type, mode, data = null) {
    const base = type === "customer" ? EMPTY_CUSTOMER : EMPTY_VEHICLE;
    if (!data) {
      setFormData({ ...base });
    } else if (type === "vehicle") {
      // Vehicles store year as integer in Supabase; convert to string for the input
      setFormData({ ...data, year: data.year?.toString() ?? "" });
    } else {
      // Customers: spread only — do not inject vehicle-only fields like "year"
      setFormData({ ...data });
    }
    setFormErrors({});
    setSaveError("");
    setModal({ type, mode, data });
  }

  function closeModal() {
    setModal(null);
    setFormData({});
    setFormErrors({});
    setSaveError("");
  }

  /* ── Field change ── */
  function handleField(e) {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: "" }));
  }

  /* ── Save customer ── */
  async function handleSaveCustomer(e) {
    e.preventDefault();
    const errors = validateCustomer(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setSaving(true);
    setSaveError("");
    try {
      if (modal.mode === "create") {
        const c = await createCustomer(formData);
        await logActivity("customer.created", "customer", c.id, { name: fullName(c) });
        setCustomers((p) =>
          [...p, c].sort((a, b) =>
            a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
          )
        );
      } else {
        const c = await updateCustomer(modal.data.id, formData);
        await logActivity("customer.updated", "customer", c.id, { name: fullName(c) });
        setCustomers((p) => p.map((x) => (x.id === c.id ? c : x)));
        if (selectedCustomer?.id === c.id) setSelectedCustomer(c);
      }
      closeModal();
    } catch {
      setSaveError("Failed to save customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Save vehicle ── */
  async function handleSaveVehicle(e) {
    e.preventDefault();
    const errors = validateVehicle(formData);
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ...formData,
        year:        formData.year ? parseInt(formData.year, 10) : null,
        customer_id: selectedCustomer.id,
      };
      if (modal.mode === "create") {
        const v = await createVehicle(payload);
        await logActivity("vehicle.created", "vehicle", v.id,
          { make: v.make, model: v.model, customer_id: selectedCustomer.id });
        setCustomerVehicles((p) => [...p, v]);
      } else {
        const v = await updateVehicle(modal.data.id, payload);
        await logActivity("vehicle.updated", "vehicle", v.id,
          { make: v.make, model: v.model });
        setCustomerVehicles((p) => p.map((x) => (x.id === v.id ? v : x)));
      }
      closeModal();
    } catch {
      setSaveError("Failed to save vehicle. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Soft deletes ── */
  async function handleDeleteCustomer(customer) {
    if (!window.confirm(
      `Remove ${fullName(customer)} from the portal?\n\nThis hides them from the list but keeps the record in the database.`
    )) return;
    try {
      await softDeleteCustomer(customer.id);
      await logActivity("customer.soft_deleted", "customer", customer.id, { name: fullName(customer) });
      setCustomers((p) => p.filter((c) => c.id !== customer.id));
      if (selectedCustomer?.id === customer.id) backToList();
    } catch {
      alert("Failed to remove customer. Please try again.");
    }
  }

  async function handleDeleteVehicle(vehicle) {
    if (!window.confirm(
      `Remove ${vehicleLabel(vehicle)} from this customer?\n\nThis hides the vehicle but keeps the record in the database.`
    )) return;
    try {
      await softDeleteVehicle(vehicle.id);
      await logActivity("vehicle.soft_deleted", "vehicle", vehicle.id,
        { make: vehicle.make, model: vehicle.model });
      setCustomerVehicles((p) => p.filter((v) => v.id !== vehicle.id));
    } catch {
      alert("Failed to remove vehicle. Please try again.");
    }
  }

  /* ── Filtered list ── */
  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(t) ||
      c.last_name?.toLowerCase().includes(t) ||
      c.email?.toLowerCase().includes(t) ||
      c.phone?.includes(t)
    );
  });

  /* ── Render ── */
  return (
    <PortalLayout title="Customers">
      {view === "list" ? (
        <ListView
          loading={loading} error={error} filtered={filtered}
          search={search} setSearch={setSearch}
          onRetry={loadCustomers}
          onNewCustomer={() => openModal("customer", "create")}
          onSelect={selectCustomer}
          onEdit={(c) => openModal("customer", "edit", c)}
          onDelete={handleDeleteCustomer}
        />
      ) : (
        <DetailView
          customer={selectedCustomer}
          vehicles={customerVehicles}
          vehiclesLoading={vehiclesLoading}
          history={history}
          historyLoading={historyLoading}
          onBack={backToList}
          onEditCustomer={() => openModal("customer", "edit", selectedCustomer)}
          onDeleteCustomer={() => handleDeleteCustomer(selectedCustomer)}
          onAddVehicle={() => openModal("vehicle", "create")}
          onEditVehicle={(v) => openModal("vehicle", "edit", v)}
          onDeleteVehicle={handleDeleteVehicle}
        />
      )}

      {modal && (
        <ModalForm
          modal={modal}
          formData={formData}
          formErrors={formErrors}
          saveError={saveError}
          saving={saving}
          onChange={handleField}
          onClose={closeModal}
          onSubmit={modal.type === "customer" ? handleSaveCustomer : handleSaveVehicle}
        />
      )}
    </PortalLayout>
  );
}

/* ============================================================
   LIST VIEW
   ============================================================ */
function ListView({
  loading, error, filtered, search, setSearch,
  onRetry, onNewCustomer, onSelect, onEdit, onDelete,
}) {
  return (
    <>
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Customers</h2>
          <p className="portalPageDesc">Search, view, and manage customer records.</p>
        </div>
        <button className="portalBtn portalBtnPrimary" onClick={onNewCustomer}>
          <i className="fa-solid fa-plus"></i> New Customer
        </button>
      </div>

      <div className="portalToolbar">
        <div className="portalSearchBar">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            className="portalSearchInput"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtered.length > 0 && (
          <span style={{ fontSize: ".82rem", color: "var(--p-text-3)" }}>
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="portalCard" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="portalEmptyState">
            <p style={{ color: "var(--p-text-3)" }}>Loading customers…</p>
          </div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load customers</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={onRetry}>
              Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon"><i className="fa-solid fa-users" style={{ opacity: .25 }}></i></div>
            <p className="portalEmptyTitle">
              {search ? "No customers match your search" : "No customers yet"}
            </p>
            <p className="portalEmptyDesc">
              {search
                ? "Try a different name, email, or phone number."
                : "Add your first customer to get started."}
            </p>
            {!search && (
              <button className="portalBtn portalBtnPrimary" onClick={onNewCustomer}>
                <i className="fa-solid fa-plus"></i> New Customer
              </button>
            )}
          </div>
        ) : (
          <table className="portalTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Contact Pref.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      onClick={() => onSelect(c)}
                      style={{
                        background: "none", border: "none", padding: 0,
                        fontFamily: "inherit", fontSize: "inherit",
                        fontWeight: 700, color: "var(--p-navy)",
                        cursor: "pointer", textAlign: "left",
                        textDecoration: "underline", textDecorationColor: "transparent",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = "var(--p-navy)"}
                      onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = "transparent"}
                    >
                      {fullName(c)}
                    </button>
                  </td>
                  <td style={{ color: "var(--p-text-2)", fontSize: ".88rem" }}>
                    {c.phone || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--p-text-2)", fontSize: ".88rem" }}>
                    {c.email || <span style={{ color: "var(--p-text-3)" }}>—</span>}
                  </td>
                  <td>
                    <span className="portalBadge active">{contactLabel(c.preferred_contact)}</span>
                  </td>
                  <td>
                    <div className="portalTableActions">
                      <button
                        className="portalBtnIcon"
                        onClick={() => onSelect(c)}
                        title="View customer"
                      >
                        <i className="fa-solid fa-eye"></i>
                      </button>
                      <button
                        className="portalBtnIcon"
                        onClick={() => onEdit(c)}
                        title="Edit customer"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button
                        className="portalBtnIcon danger"
                        onClick={() => onDelete(c)}
                        title="Remove customer"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ============================================================
   DETAIL VIEW
   ============================================================ */
function DetailView({
  customer, vehicles, vehiclesLoading,
  history, historyLoading,
  onBack, onEditCustomer, onDeleteCustomer,
  onAddVehicle, onEditVehicle, onDeleteVehicle,
}) {
  return (
    <>
      <button className="portalDetailBack" onClick={onBack}>
        <i className="fa-solid fa-arrow-left"></i> Back to Customers
      </button>

      {/* Customer header */}
      <div className="portalDetailHeader">
        <div>
          <h2 className="portalDetailName">{fullName(customer)}</h2>
          <p className="portalDetailSub">Customer since {new Date(customer.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="portalDetailActions">
          <button className="portalBtn portalBtnSecondary" onClick={onEditCustomer}>
            <i className="fa-solid fa-pen"></i> Edit
          </button>
          <button className="portalBtn portalBtnDanger" onClick={onDeleteCustomer}>
            <i className="fa-solid fa-trash"></i> Remove
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className="portalCard" style={{ marginBottom: "20px" }}>
        <p className="portalCardTitle">Contact Information</p>
        <div className="portalDetailGrid">
          <InfoItem label="Phone" value={customer.phone} />
          <InfoItem label="Email" value={customer.email} />
          <InfoItem label="Preferred Contact" value={contactLabel(customer.preferred_contact)} />
          <InfoItem label="Province" value={customer.province} />
          <InfoItem label="Address" value={[customer.address, customer.city, customer.postal_code].filter(Boolean).join(", ")} />
        </div>
        {customer.notes && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid var(--p-border)", margin: "12px 0" }} />
            <div className="portalDetailLabel">Internal Notes</div>
            <div className="portalDetailValue" style={{ marginTop: "4px", whiteSpace: "pre-wrap" }}>
              {customer.notes}
            </div>
          </>
        )}
      </div>

      {/* Vehicles */}
      <div className="portalCard">
        <p className="portalSectionTitle">
          <span>
            Vehicles
            {vehicles.length > 0 && (
              <span className="portalCountBadge" style={{ marginLeft: 8 }}>{vehicles.length}</span>
            )}
          </span>
          <button className="portalBtn portalBtnPrimary" style={{ padding: "6px 14px", fontSize: ".8rem" }} onClick={onAddVehicle}>
            <i className="fa-solid fa-plus"></i> Add Vehicle
          </button>
        </p>

        {vehiclesLoading ? (
          <p style={{ fontSize: ".85rem", color: "var(--p-text-3)", margin: 0 }}>Loading vehicles…</p>
        ) : vehicles.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <p style={{ color: "var(--p-text-3)", fontSize: ".88rem", margin: "0 0 12px" }}>
              No vehicles on file for this customer.
            </p>
            <button className="portalBtn portalBtnSecondary" onClick={onAddVehicle}>
              <i className="fa-solid fa-plus"></i> Add First Vehicle
            </button>
          </div>
        ) : (
          <div className="portalVehicleList">
            {vehicles.map((v) => (
              <div className="portalVehicleCard" key={v.id}>
                <div className="portalVehicleInfo">
                  <div className="portalVehicleName">{vehicleLabel(v)}</div>
                  <div className="portalVehicleMeta">
                    {v.color      && <span>{v.color}</span>}
                    {v.license_plate && <span>Plate: {v.license_plate}{v.plate_province ? ` (${v.plate_province})` : ""}</span>}
                    {v.vin        && <span>VIN: {v.vin}</span>}
                    {v.trim       && <span>Trim: {v.trim}</span>}
                  </div>
                </div>
                <div className="portalVehicleActions">
                  <button
                    className="portalBtnIcon"
                    onClick={() => onEditVehicle(v)}
                    title="Edit vehicle"
                  >
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button
                    className="portalBtnIcon danger"
                    onClick={() => onDeleteVehicle(v)}
                    title="Remove vehicle"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service History */}
      <ServiceHistorySection history={history} loading={historyLoading} />
    </>
  );
}

/* ── Small helper ── */
function InfoItem({ label, value }) {
  return (
    <div className="portalDetailItem">
      <div className="portalDetailLabel">{label}</div>
      <div className={`portalDetailValue${!value ? " empty" : ""}`}>
        {value || "Not provided"}
      </div>
    </div>
  );
}

/* ============================================================
   SERVICE HISTORY SECTION
   ============================================================ */
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
  draft:             "Draft",
  in_progress:       "In Progress",
  completed:         "Completed",
  sent_to_customer:  "Sent to Customer",
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

const fmtHistDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtCents = (cents) => (cents != null ? `$${(cents / 100).toFixed(2)}` : null);
const roStatusClass = (s) => s?.replace(/_/g, "-") ?? "";

function ServiceHistorySection({ history, loading }) {
  const navigate = useNavigate();

  return (
    <div className="portalCard" style={{ marginTop: "20px" }}>
      <p className="portalSectionTitle">
        <span>
          Service History
          {history?.repairOrders?.length > 0 && (
            <span className="portalCountBadge" style={{ marginLeft: 8 }}>
              {history.repairOrders.length}
            </span>
          )}
        </span>
      </p>

      {loading ? (
        <p style={{ color: "var(--p-text-3)", fontSize: ".85rem", margin: 0 }}>
          Loading service history…
        </p>
      ) : !history || history.error ? (
        <p style={{ color: "var(--p-text-3)", fontSize: ".85rem", margin: 0 }}>
          Could not load service history.
        </p>
      ) : history.repairOrders.length === 0 ? (
        <div className="portalHistoryEmpty">
          <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: "1.4rem", opacity: .25, display: "block", marginBottom: 8 }}></i>
          No service history yet for this customer.
        </div>
      ) : (
        <div className="portalHistoryList">
          {history.repairOrders.map((ro) => {
            const concerns   = history.concerns.filter((c) => c.repair_order_id === ro.id);
            const inspection = history.inspections.find((i) => i.repair_order_id === ro.id);
            const estimate   = history.estimates.find((e) => e.repair_order_id === ro.id);
            const invoice    = history.invoices.find((i) => i.repair_order_id === ro.id);
            const vehicle    = history.vehicles.find((v) => v.id === ro.vehicle_id);
            const vLabel     = vehicle
              ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
              : null;

            const isClosed = ro.status === "closed" || ro.status === "cancelled";

            return (
              <div key={ro.id} className={`portalHistoryRow${isClosed ? " closed" : ""}`}>
                {/* Header row */}
                <div className="portalHistoryRowHeader">
                  <span className="portalHistoryRONum">{ro.ro_number}</span>
                  <span className="portalHistoryDate">{fmtHistDate(ro.created_at)}</span>
                  <span className={`portalBadge ${roStatusClass(ro.status)}`} style={{ fontSize: ".68rem" }}>
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

                {/* Vehicle line */}
                {vLabel && (
                  <div className="portalHistoryVehicle">
                    <i className="fa-solid fa-car" style={{ opacity: .45, fontSize: ".78rem" }}></i>
                    {vLabel}
                    {vehicle?.license_plate && (
                      <span style={{ color: "var(--p-text-3)" }}>— {vehicle.license_plate}</span>
                    )}
                  </div>
                )}

                {/* Detail rows */}
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
                        <span className={`portalBadge ${roStatusClass(inspection.status)}`} style={{ fontSize: ".65rem" }}>
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
                        <span className={`portalBadge ${roStatusClass(estimate.status)}`} style={{ fontSize: ".65rem" }}>
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
  );
}

/* ============================================================
   MODAL FORM (customer or vehicle)
   ============================================================ */
function ModalForm({ modal, formData, formErrors, saveError, saving, onChange, onClose, onSubmit }) {
  const isCustomer = modal.type === "customer";
  const title = isCustomer
    ? (modal.mode === "create" ? "New Customer" : "Edit Customer")
    : (modal.mode === "create" ? "Add Vehicle" : "Edit Vehicle");

  return (
    <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="portalModalCard" role="dialog" aria-modal="true" aria-label={title}>
        <div className="portalModalHeader">
          <h2 className="portalModalTitle">{title}</h2>
          <button className="portalModalClose" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="portalModalBody">
            {saveError && <div className="portalModalError">{saveError}</div>}

            {isCustomer ? (
              <CustomerFormFields formData={formData} formErrors={formErrors} onChange={onChange} />
            ) : (
              <VehicleFormFields formData={formData} formErrors={formErrors} onChange={onChange} />
            )}
          </div>

          <div className="portalModalFooter">
            <button type="button" className="portalBtn portalBtnSecondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Customer form fields ── */
function CustomerFormFields({ formData, formErrors, onChange }) {
  return (
    <div className="portalForm">
      <div className="portalFormRow">
        <Field label="First Name" name="first_name" required error={formErrors.first_name}
          value={formData.first_name} onChange={onChange} />
        <Field label="Last Name" name="last_name" required error={formErrors.last_name}
          value={formData.last_name} onChange={onChange} />
      </div>
      <div className="portalFormRow">
        <Field label="Phone" name="phone" type="tel"
          value={formData.phone} onChange={onChange} />
        <Field label="Email" name="email" type="email" error={formErrors.email}
          value={formData.email} onChange={onChange} />
      </div>
      <div className="portalFormField">
        <label className="portalFormLabel">Preferred Contact</label>
        <select className="portalFormSelect" name="preferred_contact"
          value={formData.preferred_contact} onChange={onChange}>
          {CONTACT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <p className="portalFormSection">Address (Optional)</p>

      <Field label="Street Address" name="address"
        value={formData.address} onChange={onChange} />
      <div className="portalFormRow">
        <Field label="City" name="city"
          value={formData.city} onChange={onChange} />
        <div className="portalFormField">
          <label className="portalFormLabel">Province</label>
          <select className="portalFormSelect" name="province"
            value={formData.province} onChange={onChange}>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <Field label="Postal Code" name="postal_code"
        value={formData.postal_code} onChange={onChange} />

      <p className="portalFormSection">Internal Notes (Optional)</p>

      <div className="portalFormField">
        <label className="portalFormLabel">Notes</label>
        <textarea className="portalFormTextarea" name="notes" rows={3}
          placeholder="Known issues, preferences, or anything else staff should know…"
          value={formData.notes} onChange={onChange} />
      </div>
    </div>
  );
}

/* ── Vehicle form fields ── */
function VehicleFormFields({ formData, formErrors, onChange }) {
  return (
    <div className="portalForm">
      <div className="portalFormRow">
        <Field label="Year" name="year" type="number" error={formErrors.year}
          placeholder="e.g. 2019"
          value={formData.year} onChange={onChange} />
        <Field label="Color" name="color"
          placeholder="e.g. White"
          value={formData.color} onChange={onChange} />
      </div>
      <div className="portalFormRow">
        <Field label="Make" name="make" required error={formErrors.make}
          placeholder="e.g. Toyota"
          value={formData.make} onChange={onChange} />
        <Field label="Model" name="model" required error={formErrors.model}
          placeholder="e.g. Camry"
          value={formData.model} onChange={onChange} />
      </div>
      <Field label="Trim" name="trim"
        placeholder="e.g. XSE V6 (optional)"
        value={formData.trim} onChange={onChange} />

      <p className="portalFormSection">Registration (Optional)</p>

      <div className="portalFormRow">
        <Field label="License Plate" name="license_plate"
          placeholder="e.g. ABC 1234"
          value={formData.license_plate} onChange={onChange} />
        <div className="portalFormField">
          <label className="portalFormLabel">Plate Province</label>
          <select className="portalFormSelect" name="plate_province"
            value={formData.plate_province} onChange={onChange}>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <Field label="VIN" name="vin" error={formErrors.vin}
        placeholder="Up to 17 characters (optional)"
        value={formData.vin} onChange={onChange} />

      <p className="portalFormSection">Notes (Optional)</p>

      <div className="portalFormField">
        <label className="portalFormLabel">Notes</label>
        <textarea className="portalFormTextarea" name="notes" rows={2}
          placeholder="Known issues, recurring concerns, customer preferences…"
          value={formData.notes} onChange={onChange} />
      </div>
    </div>
  );
}

/* ── Reusable text/input field ── */
function Field({ label, name, type = "text", required, error, value, onChange, placeholder }) {
  return (
    <div className="portalFormField">
      <label className="portalFormLabel" htmlFor={name}>
        {label}{required && <span className="req">*</span>}
      </label>
      <input
        id={name}
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
