import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";
import {
  listEstimates, getEstimate,
  updateEstimate, updateEstimateStatus,
  createEstimateItem, updateEstimateItem, softHideEstimateItem,
  recalculateEstimateTotals, logActivity,
  getHelcimInvoiceByEstimate, createHelcimInvoiceFromEstimate,
  listCannedJobs, getCannedJob,
  createCannedJob, updateCannedJob, softHideCannedJob,
  createCannedJobItem, updateCannedJobItem,
  addCannedJobToEstimate,
  listEstimateJobs, createEstimateJob, updateEstimateJob, softHideEstimateJob,
  ungroupEstimateJobItems,
  ensureEstimateJobsFromRepairOrder,
} from "../../lib/portalData";

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ── Constants ─────────────────────────────────────────────── */
const STATUS_LABELS = {
  draft:              "Draft",
  sent:               "Sent",
  partially_approved: "Partially Approved",
  approved:           "Approved",
  declined:           "Declined",
  expired:            "Expired",
  cancelled:          "Cancelled",
};
const STATUS_FILTERS = ["all","draft","sent","partially_approved","approved","declined","expired","cancelled"];
const ITEM_TYPE_LABELS = {
  labor:       "Labour",
  part:        "Part",
  shop_supply: "Shop Supply",
  fee:         "Fee",
  discount:    "Discount",
  other:       "Other",
};
const ITEM_APPROVAL_LABELS = {
  pending:  "Pending",
  approved: "Approved",
  declined: "Declined",
};

const EMPTY_ITEM_FORM = {
  item_type:           "labor",
  description:         "",
  quantity:            "1",
  cost_dollars:        "",
  markup_percent:      "",
  unit_price_dollars:  "0.00",
  is_required:         false,
  is_customer_visible: true,
  notes:               "",
};

/* ── Helpers ─────────────────────────────────────────────────── */
const statusClass = (s) => s?.replace(/_/g, "-") ?? "draft";
const typeClass   = (t) => t?.replace(/_/g, "-") ?? "other";

function fmtCents(cents) {
  if (cents == null) return "$0.00";
  const val = (cents / 100).toFixed(2);
  return cents < 0 ? `-$${Math.abs(parseFloat(val)).toFixed(2)}` : `$${val}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" });
}
const fullName = (c) => c ? `${c.first_name} ${c.last_name}` : "—";
const vehicleLabel = (v) => v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "—";

function validateItemForm(d) {
  const e = {};
  if (!d.description?.trim()) e.description = "Description is required.";
  if (parseFloat(d.quantity) < 0) e.quantity = "Quantity must be 0 or greater.";
  if (parseFloat(d.unit_price_dollars) < 0) e.unit_price_dollars = "Price must be 0 or greater.";
  if (d.cost_dollars !== "" && parseFloat(d.cost_dollars) < 0) e.cost_dollars = "Cost must be 0 or greater.";
  if (d.markup_percent !== "" && parseFloat(d.markup_percent) < 0) e.markup_percent = "Markup must be 0 or greater.";
  return e;
}

/* ── Item type badge ── */
function TypeBadge({ type }) {
  return (
    <span className={`portalTypeBadge ${typeClass(type)}`}>
      {ITEM_TYPE_LABELS[type] ?? type}
    </span>
  );
}

/* ── Shared item table (used in both flat and grouped modes) ── */
function ItemTable({ items, onEdit, onHide, disabled }) {
  if (!items.length) return null;
  return (
    <div style={{ overflowX:"auto" }}>
      <table className="portalEstItemTable">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th className="money">Qty</th>
            <th className="money">Customer Price</th>
            <th className="money">Total</th>
            <th>Status</th>
            <th>Visible</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><TypeBadge type={item.item_type} /></td>
              <td>
                <span style={{ fontWeight:600 }}>{item.description}</span>
                {item.is_required && (
                  <span style={{ marginLeft:6, fontSize:".65rem", fontWeight:700, color:"var(--p-warning)", textTransform:"uppercase" }}>Required</span>
                )}
                {item.cost_cents != null && (
                  <div className="portalItemCostHint">
                    Cost: {fmtCents(item.cost_cents)}
                    {item.markup_percent != null && ` · +${item.markup_percent}%`}
                  </div>
                )}
                {item.notes && (
                  <div style={{ fontSize:".75rem", color:"var(--p-text-3)", marginTop:2 }}>{item.notes}</div>
                )}
              </td>
              <td className="money" style={{ color:"var(--p-text-2)" }}>{item.quantity}</td>
              <td className="money" style={{ color:"var(--p-text-2)" }}>{fmtCents(item.unit_price_cents)}</td>
              <td className="money" style={{ fontWeight:700, color: item.item_type === "discount" ? "var(--p-danger)" : "var(--p-text)" }}>
                {item.item_type === "discount" ? `-${fmtCents(item.line_total_cents)}` : fmtCents(item.line_total_cents)}
              </td>
              <td>
                <span className={`portalBadge ${item.approval_status}`}>
                  {ITEM_APPROVAL_LABELS[item.approval_status] ?? item.approval_status}
                </span>
              </td>
              <td style={{ textAlign:"center" }}>
                <i className={`fa-solid ${item.is_customer_visible ? "fa-eye" : "fa-eye-slash"}`}
                  style={{ color: item.is_customer_visible ? "var(--p-success)" : "var(--p-text-3)" }}></i>
              </td>
              <td>
                <div className="portalTableActions">
                  <button className="portalBtnIcon" onClick={() => onEdit(item)} title="Edit item" disabled={disabled}>
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button className="portalBtnIcon danger" onClick={() => onHide(item)} title="Hide item" disabled={disabled}>
                    <i className="fa-solid fa-eye-slash"></i>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Item form (used in add + edit modals) ── */
function ItemForm({ formData, formErrors, onChange, saving, onSubmit, onClose, title }) {
  const lineTotal = Math.round(
    Math.max(0, parseFloat(formData.quantity) || 0) *
    Math.round((parseFloat(formData.unit_price_dollars) || 0) * 100)
  );

  const hasCost   = formData.cost_dollars !== "" && !isNaN(parseFloat(formData.cost_dollars));
  const hasMarkup = formData.markup_percent !== "" && !isNaN(parseFloat(formData.markup_percent));

  return (
    <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="portalModalCard" style={{ maxWidth:"540px" }} role="dialog" aria-modal="true">
        <div className="portalModalHeader">
          <h2 className="portalModalTitle">{title}</h2>
          <button className="portalModalClose" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <form onSubmit={onSubmit} noValidate>
          <div className="portalModalBody">
            <div className="portalForm">
              <div className="portalFormRow">
                <div className="portalFormField">
                  <label className="portalFormLabel">Type</label>
                  <select className="portalFormSelect" name="item_type" value={formData.item_type} onChange={onChange}>
                    {Object.entries(ITEM_TYPE_LABELS).map(([v, lbl]) => (
                      <option key={v} value={v}>{lbl}</option>
                    ))}
                  </select>
                </div>
                <div className="portalFormField">
                  <label className="portalFormLabel">Quantity</label>
                  <input className={`portalFormInput${formErrors.quantity ? " invalid" : ""}`}
                    name="quantity" type="number" min="0" step="0.5"
                    value={formData.quantity} onChange={onChange} />
                  {formErrors.quantity && <p className="portalFormFieldError">{formErrors.quantity}</p>}
                </div>
              </div>

              <div className="portalFormField">
                <label className="portalFormLabel">Description<span className="req">*</span></label>
                <input className={`portalFormInput${formErrors.description ? " invalid" : ""}`}
                  name="description" type="text"
                  placeholder="e.g. Replace front brake pads — labour"
                  value={formData.description} onChange={onChange} autoComplete="off" />
                {formErrors.description && <p className="portalFormFieldError">{formErrors.description}</p>}
              </div>

              {/* Staff-only internal pricing — never shown to customers */}
              <div className="portalItemPricingSection">
                <p className="portalItemPricingLabel">
                  <i className="fa-solid fa-lock" style={{ fontSize:".65rem", marginRight:5, opacity:.7 }}></i>
                  Staff-Only Pricing — not shown to customers
                </p>
                <div className="portalFormRow">
                  <div className="portalFormField">
                    <label className="portalFormLabel">Internal Cost ($)</label>
                    <input className={`portalFormInput${formErrors.cost_dollars ? " invalid" : ""}`}
                      name="cost_dollars" type="number" min="0" step="0.01"
                      value={formData.cost_dollars} onChange={onChange}
                      placeholder="0.00" />
                    {formErrors.cost_dollars && <p className="portalFormFieldError">{formErrors.cost_dollars}</p>}
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Markup (%)</label>
                    <input className={`portalFormInput${formErrors.markup_percent ? " invalid" : ""}`}
                      name="markup_percent" type="number" min="0" step="0.1"
                      value={formData.markup_percent} onChange={onChange}
                      placeholder="0" />
                    {formErrors.markup_percent && <p className="portalFormFieldError">{formErrors.markup_percent}</p>}
                  </div>
                </div>
                {hasCost && hasMarkup && (
                  <p style={{ margin:"0 0 4px", fontSize:".72rem", color:"var(--p-text-3)" }}>
                    <i className="fa-solid fa-calculator" style={{ marginRight:4 }}></i>
                    Auto-calculated from cost × (1 + markup%)
                  </p>
                )}
              </div>

              <div className="portalFormRow">
                <div className="portalFormField">
                  <label className="portalFormLabel">Customer Price ($)</label>
                  <input className={`portalFormInput${formErrors.unit_price_dollars ? " invalid" : ""}`}
                    name="unit_price_dollars" type="number" min="0" step="0.01"
                    value={formData.unit_price_dollars} onChange={onChange} />
                  {formErrors.unit_price_dollars && <p className="portalFormFieldError">{formErrors.unit_price_dollars}</p>}
                </div>
                <div className="portalFormField">
                  <label className="portalFormLabel">Line Total</label>
                  <div style={{ padding:"9px 12px", border:"1.5px solid var(--p-border)", borderRadius:"var(--p-radius-sm)", background:"var(--p-bg)", fontFamily:"monospace", fontWeight:700, color:"var(--p-navy)" }}>
                    {fmtCents(lineTotal)}
                  </div>
                </div>
              </div>

              <div className="portalFormField">
                <label className="portalFormLabel">Notes (optional)</label>
                <textarea className="portalFormTextarea" name="notes" rows={2}
                  placeholder="Internal notes for this line item…"
                  value={formData.notes} onChange={onChange} />
              </div>

              <div style={{ display:"flex", gap:"20px", flexWrap:"wrap" }}>
                <label style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:".85rem", cursor:"pointer" }}>
                  <input type="checkbox" name="is_required"
                    checked={formData.is_required} onChange={onChange}
                    style={{ accentColor:"var(--p-navy)" }} />
                  Required (can't be declined)
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:".85rem", cursor:"pointer" }}>
                  <input type="checkbox" name="is_customer_visible"
                    checked={formData.is_customer_visible} onChange={onChange}
                    style={{ accentColor:"var(--p-navy)" }} />
                  Customer visible
                </label>
              </div>
            </div>
          </div>
          <div className="portalModalFooter">
            <button type="button" className="portalBtn portalBtnSecondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
              {saving ? "Saving…" : "Save Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================ */
export default function PortalEstimates() {
  const location  = useLocation();
  const navigate  = useNavigate();

  /* ── List state ── */
  const [estimates,    setEstimates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  /* ── Builder state ── */
  const [view,          setView]          = useState("list");
  const [activeEst,     setActiveEst]     = useState(null);
  const [items,         setItems]         = useState([]);
  const [totals,        setTotals]        = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [changingStatus,setChangingStatus]= useState(false);
  const [savingMeta,    setSavingMeta]    = useState(false);
  const [localTitle,    setLocalTitle]    = useState("");
  const [localMsg,      setLocalMsg]      = useState("");
  // Item modals
  const [addModal,      setAddModal]      = useState(false);
  const [editModal,     setEditModal]     = useState(null); // item being edited
  const [itemForm,      setItemForm]      = useState({ ...EMPTY_ITEM_FORM });
  const [itemFormErrors,setItemFormErrors]= useState({});
  const [savingItem,    setSavingItem]    = useState(false);
  const [itemSaveError, setItemSaveError] = useState("");
  // Invoice linking
  const [estInvoice,   setEstInvoice]   = useState(null);
  const [invLoading,   setInvLoading]   = useState(false);
  // Send for Approval modal
  const [sendModal,    setSendModal]    = useState(false);
  const [sendEmail,    setSendEmail]    = useState("");
  const [sendMessage,  setSendMessage]  = useState("");
  const [sending,      setSending]      = useState(false);
  const [sendError,    setSendError]    = useState("");
  const [sendSuccess,  setSendSuccess]  = useState(false);

  /* ── Canned jobs state ── */
  const [presetModal,     setPresetModal]     = useState(false);  // preset picker modal open
  const [cannedJobs,      setCannedJobs]      = useState([]);     // list for picker
  const [presetLoading,   setPresetLoading]   = useState(false);
  const [previewJob,      setPreviewJob]      = useState(null);   // { id, name, items[] }
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [addingPreset,    setAddingPreset]    = useState(false);
  const [presetError,     setPresetError]     = useState("");

  const [manageModal,     setManageModal]     = useState(false);  // manage canned jobs modal open
  const [allCannedJobs,   setAllCannedJobs]   = useState([]);     // includes inactive
  const [manageLoading,   setManageLoading]   = useState(false);
  const [manageSel,       setManageSel]       = useState(null);   // currently editing job { id, items[] }
  const [manageJobForm,   setManageJobForm]   = useState({ name:"", description:"", category:"", sort_order:"0" });
  const [manageJobErrors, setManageJobErrors] = useState({});
  const [savingJob,       setSavingJob]       = useState(false);
  const [manageItemForm,  setManageItemForm]  = useState({ ...EMPTY_ITEM_FORM, sort_order:"0" });
  const [manageItemErrors,setManageItemErrors]= useState({});
  const [savingManageItem,setSavingManageItem]= useState(false);
  const [addItemToJobMode,setAddItemToJobMode]= useState(false);  // show add-item sub-form
  const [editingJobItem,  setEditingJobItem]  = useState(null);   // item being edited
  const [manageError,     setManageError]     = useState("");

  /* ── Estimate job sections ── */
  const [jobs,            setJobs]            = useState([]);   // active estimate_jobs for current estimate
  const [addingToJob,     setAddingToJob]     = useState(null); // jobId context for add item / add preset (null = ungrouped)
  const [addJobModal,     setAddJobModal]     = useState(false);
  const [newJobForm,      setNewJobForm]      = useState({ title: "", notes: "" });
  const [newJobFormErrors,setNewJobFormErrors]= useState({});
  const [savingNewJob,    setSavingNewJob]    = useState(false);

  /* ── Load list ── */
  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try { setEstimates(await listEstimates()); }
    catch { setError("Failed to load estimates. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  /* ── Auto-open from navigation state ── */
  useEffect(() => {
    const id = location.state?.estimateId;
    if (!id) return;
    openBuilderById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.estimateId]);

  /* ── Open builder ── */
  async function openBuilderById(estimateId) {
    setEditorLoading(true);
    setView("editor");
    try {
      const est = await getEstimate(estimateId);
      setActiveEst(est);
      setItems(est.items || []);
      setLocalTitle(est.title ?? "");
      setLocalMsg(est.customer_message ?? "");
      setTotals({ subtotal_cents: est.subtotal_cents, tax_cents: est.tax_cents, total_cents: est.total_cents, approved_total_cents: est.approved_total_cents });

      // Load job sections; auto-create from RO concerns if none exist yet
      let estJobs = est.jobs || [];
      if (est.repair_order_id && estJobs.length === 0) {
        estJobs = await ensureEstimateJobsFromRepairOrder(estimateId, est.repair_order_id).catch(() => []);
      }
      setJobs(estJobs);

      // Check for existing invoice
      const inv = await getHelcimInvoiceByEstimate(estimateId).catch(() => null);
      setEstInvoice(inv);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[PortalEstimates] open builder:", err);
      setView("list");
    } finally {
      setEditorLoading(false);
    }
  }

  function backToList() {
    setView("list"); setActiveEst(null); setItems([]); setTotals(null); setJobs([]); setAddingToJob(null);
    loadList();
  }

  /* ── Refresh totals from DB ── */
  async function refreshTotals(estimateId) {
    const updated = await recalculateEstimateTotals(estimateId).catch(() => null);
    if (updated) setTotals(updated);
  }

  /* ── Filter ── */
  const filtered = estimates.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    const ro = e.repair_orders;
    return (
      e.estimate_number?.toLowerCase().includes(t) ||
      ro?.ro_number?.toLowerCase().includes(t) ||
      ro?.customers?.first_name?.toLowerCase().includes(t) ||
      ro?.customers?.last_name?.toLowerCase().includes(t) ||
      ro?.vehicles?.make?.toLowerCase().includes(t) ||
      ro?.vehicles?.model?.toLowerCase().includes(t)
    );
  });
  const counts = estimates.reduce((a, e) => { a[e.status] = (a[e.status]||0)+1; return a; }, {});

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!activeEst || changingStatus) return;
    if (newStatus === "cancelled" &&
        !window.confirm(`Cancel estimate ${activeEst.estimate_number}? This cannot be undone easily.`)) return;
    setChangingStatus(true);
    try {
      const updated = await updateEstimateStatus(activeEst.id, newStatus);
      await logActivity("estimate.status_changed", "estimate", activeEst.id, {
        estimate_number: activeEst.estimate_number, from: activeEst.status, to: newStatus,
      });
      setActiveEst((p) => ({ ...p, ...updated }));
      setEstimates((p) => p.map((e) => e.id === updated.id ? { ...e, status: updated.status } : e));
    } catch { alert("Failed to update status. Please try again."); }
    finally { setChangingStatus(false); }
  }

  /* ── Save meta (title / customer message) on blur ── */
  async function saveMeta() {
    if (!activeEst) return;
    if (localTitle === activeEst.title && localMsg === activeEst.customer_message) return;
    setSavingMeta(true);
    try {
      await updateEstimate(activeEst.id, { title: localTitle || null, customer_message: localMsg || null });
      await logActivity("estimate.updated", "estimate", activeEst.id, { field: "meta" });
      setActiveEst((p) => ({ ...p, title: localTitle || null, customer_message: localMsg || null }));
    } catch { /* silent */ }
    finally { setSavingMeta(false); }
  }

  /* ── Send for Approval ── */
  function openSendModal() {
    // Pre-fill email from customer record if available
    setSendEmail(activeEst?.customer?.email ?? "");
    setSendMessage(activeEst?.customer_message ?? "");
    setSendError("");
    setSendSuccess(false);
    setSendModal(true);
  }

  async function handleSendForApproval(e) {
    e.preventDefault();
    if (!isValidEmail(sendEmail)) { setSendError("A valid customer email is required."); return; }
    setSending(true); setSendError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const res = await fetch("/.netlify/functions/send-estimate-approval", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          estimateId:    activeEst.id,
          customerEmail: sendEmail.trim(),
          message:       sendMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to send approval email.");
      await logActivity("estimate.sent_for_approval", "estimate", activeEst.id, {
        estimate_number: activeEst.estimate_number, email: sendEmail,
      });
      setSendSuccess(true);
      // Refresh estimate to show updated status
      const refreshed = await getEstimate(activeEst.id);
      setActiveEst(refreshed);
      setItems(refreshed.items || []);
      setJobs(refreshed.jobs || []);
      setTotals({ subtotal_cents: refreshed.subtotal_cents, tax_cents: refreshed.tax_cents, total_cents: refreshed.total_cents, approved_total_cents: refreshed.approved_total_cents });
      setEstimates((p) => p.map((e) => e.id === refreshed.id ? { ...e, status: refreshed.status } : e));
    } catch (err) {
      setSendError(err.message || "Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  /* ── Create invoice from estimate ── */
  async function handleCreateInvoice() {
    if (!activeEst) return;
    setInvLoading(true);
    try {
      const inv = await createHelcimInvoiceFromEstimate(activeEst.id);
      await logActivity("invoice.created", "helcim_invoice", inv.id, {
        estimate_number: activeEst.estimate_number, from_estimate: true,
      });
      setEstInvoice(inv);
      navigate("/portal/invoices", { state: { invoiceId: inv.id } });
    } catch {
      alert("Failed to create invoice record. Please try again.");
    } finally {
      setInvLoading(false);
    }
  }

  const canSendForApproval =
    activeEst &&
    activeEst.status !== "cancelled" &&
    activeEst.status !== "approved" &&
    (totals?.total_cents ?? 0) > 0 &&
    items.length > 0;

  /* ── Item form field handler ── */
  function handleItemField(e) {
    const { name, value, type, checked } = e.target;
    const newVal = type === "checkbox" ? checked : value;
    setItemForm((p) => {
      const updated = { ...p, [name]: newVal };
      // Auto-calculate customer price when cost or markup changes
      if (name === "cost_dollars" || name === "markup_percent") {
        const cost   = parseFloat(name === "cost_dollars"   ? newVal : updated.cost_dollars);
        const markup = parseFloat(name === "markup_percent" ? newVal : updated.markup_percent);
        if (!isNaN(cost) && cost >= 0 && !isNaN(markup) && markup >= 0) {
          updated.unit_price_dollars = (cost * (1 + markup / 100)).toFixed(2);
        }
      }
      return updated;
    });
    if (itemFormErrors[name]) setItemFormErrors((p) => ({ ...p, [name]: "" }));
  }

  /* ── Open add modal ── */
  function openAddModal(jobId = null) {
    setAddingToJob(jobId ?? null);
    setItemForm({ ...EMPTY_ITEM_FORM });
    setItemFormErrors({});
    setItemSaveError("");
    setAddModal(true);
  }

  /* ── Open edit modal ── */
  function openEditModal(item) {
    setItemForm({
      item_type:           item.item_type,
      description:         item.description,
      quantity:            item.quantity?.toString() ?? "1",
      cost_dollars:        item.cost_cents != null ? (item.cost_cents / 100).toFixed(2) : "",
      markup_percent:      item.markup_percent != null ? String(item.markup_percent) : "",
      unit_price_dollars:  ((item.unit_price_cents ?? 0) / 100).toFixed(2),
      is_required:         item.is_required ?? false,
      is_customer_visible: item.is_customer_visible ?? true,
      notes:               item.notes ?? "",
    });
    setItemFormErrors({});
    setItemSaveError("");
    setEditModal(item);
  }

  function closeItemModals() {
    setAddModal(false); setEditModal(null);
    setItemForm({ ...EMPTY_ITEM_FORM });
    setItemFormErrors({}); setItemSaveError("");
  }

  /* ── Add item ── */
  async function handleAddItem(e) {
    e.preventDefault();
    const errors = validateItemForm(itemForm);
    if (Object.keys(errors).length) { setItemFormErrors(errors); return; }
    setSavingItem(true); setItemSaveError("");
    try {
      const newItem = await createEstimateItem(activeEst.id, activeEst.repair_order_id, { ...itemForm, estimate_job_id: addingToJob });
      await logActivity("estimate.item_created", "estimate_item", newItem.id, {
        estimate_number: activeEst.estimate_number, description: newItem.description,
      });
      setItems((p) => [...p, newItem].sort((a, b) => a.sort_order - b.sort_order));
      await refreshTotals(activeEst.id);
      closeItemModals();
    } catch { setItemSaveError("Failed to add item. Please try again."); }
    finally { setSavingItem(false); }
  }

  /* ── Edit item ── */
  async function handleEditItem(e) {
    e.preventDefault();
    const errors = validateItemForm(itemForm);
    if (Object.keys(errors).length) { setItemFormErrors(errors); return; }
    setSavingItem(true); setItemSaveError("");
    try {
      const updated = await updateEstimateItem(editModal.id, activeEst.id, itemForm);
      await logActivity("estimate.item_updated", "estimate_item", editModal.id, {
        estimate_number: activeEst.estimate_number,
      });
      setItems((p) => p.map((i) => i.id === updated.id ? updated : i));
      await refreshTotals(activeEst.id);
      closeItemModals();
    } catch { setItemSaveError("Failed to save item. Please try again."); }
    finally { setSavingItem(false); }
  }

  /* ── Hide item ── */
  async function handleHideItem(item) {
    if (!window.confirm(`Hide "${item.description}"? It will be removed from the estimate.`)) return;
    try {
      await softHideEstimateItem(item.id, activeEst.id);
      await logActivity("estimate.item_hidden", "estimate_item", item.id, {
        estimate_number: activeEst.estimate_number, description: item.description,
      });
      setItems((p) => p.filter((i) => i.id !== item.id));
      await refreshTotals(activeEst.id);
    } catch { alert("Failed to hide item. Please try again."); }
  }

  /* ── Job section handlers ── */
  function openAddJobModal() {
    setNewJobForm({ title: "", notes: "" });
    setNewJobFormErrors({});
    setAddJobModal(true);
  }

  async function handleSaveNewJob(e) {
    e.preventDefault();
    if (!newJobForm.title.trim()) {
      setNewJobFormErrors({ title: "Job title is required." });
      return;
    }
    setSavingNewJob(true);
    try {
      const maxSort = jobs.reduce((m, j) => Math.max(m, j.sort_order), -1);
      const created = await createEstimateJob(activeEst.id, {
        title:      newJobForm.title.trim(),
        notes:      newJobForm.notes.trim() || null,
        sort_order: maxSort + 1,
      });
      setJobs((prev) => [...prev, created]);
      setAddJobModal(false);
    } catch { setNewJobFormErrors({ title: "Failed to create job. Please try again." }); }
    finally { setSavingNewJob(false); }
  }

  function handleJobTitleChange(jobId, val) {
    setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, title: val } : j));
  }

  function handleJobNotesChange(jobId, val) {
    setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, notes: val } : j));
  }

  async function handleJobBlur(job) {
    try {
      await updateEstimateJob(job.id, { title: job.title || "Job", notes: job.notes ?? null });
    } catch { /* silent — next save or reload will reconcile */ }
  }

  async function handleHideJob(jobId) {
    if (!window.confirm("Remove this job group from the estimate? Existing line items will be moved to Ungrouped.")) return;
    try {
      await ungroupEstimateJobItems(jobId);
      setItems((prev) => prev.map((i) => i.estimate_job_id === jobId ? { ...i, estimate_job_id: null } : i));
      await softHideEstimateJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch { alert("Failed to remove job group. Please try again."); }
  }

  /* ── Preset job picker ── */
  async function openPresetModal(jobId = null) {
    setAddingToJob(jobId ?? null);
    setPresetModal(true);
    setPreviewJob(null);
    setPresetError("");
    setPresetLoading(true);
    try {
      const cannedList = await listCannedJobs();
      setCannedJobs(cannedList);
    } catch { setPresetError("Failed to load preset jobs."); }
    finally { setPresetLoading(false); }
  }

  async function selectPreviewJob(job) {
    setPreviewJob(null);
    setPreviewLoading(true);
    try {
      const full = await getCannedJob(job.id);
      setPreviewJob(full);
    } catch { setPresetError("Failed to load job details."); }
    finally { setPreviewLoading(false); }
  }

  async function handleAddPreset() {
    if (!previewJob || addingPreset) return;
    setAddingPreset(true); setPresetError("");
    try {
      const newItems = await addCannedJobToEstimate(activeEst.id, activeEst.repair_order_id, previewJob.id, addingToJob);
      setItems((p) => [...p, ...newItems].sort((a, b) => a.sort_order - b.sort_order));
      await refreshTotals(activeEst.id);
      setPresetModal(false);
      setPreviewJob(null);
    } catch { setPresetError("Failed to add preset. Please try again."); }
    finally { setAddingPreset(false); }
  }

  /* ── Manage Canned Jobs modal ── */
  async function openManageModal() {
    setManageModal(true);
    setManageSel(null);
    setManageJobForm({ name:"", description:"", category:"", sort_order:"0" });
    setManageJobErrors({});
    setManageError("");
    setAddItemToJobMode(false);
    setEditingJobItem(null);
    setManageLoading(true);
    try {
      // Load all jobs including inactive for management
      const { data, error } = await supabase
        .from("canned_jobs")
        .select("id, name, description, category, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("name",       { ascending: true });
      if (error) throw error;
      setAllCannedJobs(data ?? []);
    } catch { setManageError("Failed to load canned jobs."); }
    finally { setManageLoading(false); }
  }

  async function selectManageJob(job) {
    setManageSel(null);
    setAddItemToJobMode(false);
    setEditingJobItem(null);
    setManageJobForm({
      name:        job.name        ?? "",
      description: job.description ?? "",
      category:    job.category    ?? "",
      sort_order:  String(job.sort_order ?? 0),
    });
    setManageJobErrors({});
    setManageError("");
    setManageLoading(true);
    try {
      const full = await getCannedJob(job.id);
      setManageSel(full);
    } catch { setManageError("Failed to load job details."); }
    finally { setManageLoading(false); }
  }

  async function handleSaveCannedJob(e) {
    e.preventDefault();
    const errs = {};
    if (!manageJobForm.name?.trim()) errs.name = "Name is required.";
    if (Object.keys(errs).length) { setManageJobErrors(errs); return; }
    setSavingJob(true); setManageError("");
    try {
      if (manageSel?.id) {
        const updated = await updateCannedJob(manageSel.id, {
          name:        manageJobForm.name.trim(),
          description: manageJobForm.description || null,
          category:    manageJobForm.category    || null,
          sort_order:  parseInt(manageJobForm.sort_order ?? 0) || 0,
        });
        setManageSel((p) => ({ ...p, ...updated }));
        setAllCannedJobs((p) => p.map((j) => j.id === updated.id ? { ...j, ...updated } : j));
      } else {
        const created = await createCannedJob({
          name:        manageJobForm.name.trim(),
          description: manageJobForm.description || null,
          category:    manageJobForm.category    || null,
          sort_order:  parseInt(manageJobForm.sort_order ?? 0) || 0,
        });
        setAllCannedJobs((p) => [...p, created]);
        const full = await getCannedJob(created.id);
        setManageSel(full);
        setManageJobForm({
          name:        full.name        ?? "",
          description: full.description ?? "",
          category:    full.category    ?? "",
          sort_order:  String(full.sort_order ?? 0),
        });
      }
    } catch { setManageError("Failed to save. Please try again."); }
    finally { setSavingJob(false); }
  }

  async function handleHideCannedJob(job) {
    if (!window.confirm(`Deactivate "${job.name}"? It will no longer appear in the preset picker.`)) return;
    try {
      await softHideCannedJob(job.id);
      setAllCannedJobs((p) => p.map((j) => j.id === job.id ? { ...j, is_active: false } : j));
      if (manageSel?.id === job.id) setManageSel((p) => ({ ...p, is_active: false }));
    } catch { setManageError("Failed to deactivate. Please try again."); }
  }

  async function handleReactivateCannedJob(job) {
    try {
      const updated = await updateCannedJob(job.id, { is_active: true });
      setAllCannedJobs((p) => p.map((j) => j.id === updated.id ? { ...j, is_active: true } : j));
      if (manageSel?.id === job.id) setManageSel((p) => ({ ...p, is_active: true }));
    } catch { setManageError("Failed to reactivate. Please try again."); }
  }

  function openEditJobItem(item) {
    setEditingJobItem(item);
    setAddItemToJobMode(false);
    setManageItemForm({
      item_type:           item.item_type,
      description:         item.description,
      quantity:            String(item.quantity),
      cost_dollars:        item.cost_cents != null ? (item.cost_cents / 100).toFixed(2) : "",
      markup_percent:      item.markup_percent != null ? String(item.markup_percent) : "",
      unit_price_dollars:  ((item.unit_price_cents ?? 0) / 100).toFixed(2),
      is_required:         item.is_required   ?? false,
      is_customer_visible: item.is_customer_visible ?? true,
      notes:               item.notes ?? "",
      sort_order:          String(item.sort_order ?? 0),
    });
    setManageItemErrors({});
  }

  function handleManageItemField(e) {
    const { name, value, type, checked } = e.target;
    const newVal = type === "checkbox" ? checked : value;
    setManageItemForm((p) => {
      const updated = { ...p, [name]: newVal };
      if (name === "cost_dollars" || name === "markup_percent") {
        const cost   = parseFloat(name === "cost_dollars"   ? newVal : updated.cost_dollars);
        const markup = parseFloat(name === "markup_percent" ? newVal : updated.markup_percent);
        if (!isNaN(cost) && cost >= 0 && !isNaN(markup) && markup >= 0) {
          updated.unit_price_dollars = (cost * (1 + markup / 100)).toFixed(2);
        }
      }
      return updated;
    });
    if (manageItemErrors[name]) setManageItemErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleSaveCannedJobItem(e) {
    e.preventDefault();
    const errs = validateItemForm(manageItemForm);
    if (Object.keys(errs).length) { setManageItemErrors(errs); return; }
    setSavingManageItem(true); setManageError("");
    try {
      if (editingJobItem) {
        const updated = await updateCannedJobItem(editingJobItem.id, manageItemForm);
        setManageSel((p) => ({ ...p, items: p.items.map((i) => i.id === updated.id ? updated : i) }));
        setEditingJobItem(null);
      } else {
        const created = await createCannedJobItem(manageSel.id, manageItemForm);
        setManageSel((p) => ({ ...p, items: [...(p.items ?? []), created] }));
        setAddItemToJobMode(false);
      }
      setManageItemForm({ ...EMPTY_ITEM_FORM, sort_order:"0" });
      setManageItemErrors({});
    } catch { setManageError("Failed to save item. Please try again."); }
    finally { setSavingManageItem(false); }
  }

  /* ═══════════════════════════════════════════════════════════
     BUILDER VIEW
     ═══════════════════════════════════════════════════════════ */
  if (view === "editor") {
    return (
      <PortalLayout title="Estimate Builder">
        {editorLoading ? (
          <div className="portalEmptyState"><p style={{ color:"var(--p-text-3)" }}>Loading estimate…</p></div>
        ) : activeEst ? (
          <>
            {/* Back */}
            <button className="portalDetailBack" onClick={backToList}>
              <i className="fa-solid fa-arrow-left"></i> Back to Estimates
            </button>

            {/* Header */}
            <div className="portalDetailHeader">
              <div>
                <p style={{ margin:"0 0 4px", fontFamily:"monospace", fontWeight:800, fontSize:"1.1rem", color:"var(--p-navy)" }}>
                  {activeEst.estimate_number}
                  {activeEst.ro?.ro_number && (
                    <span style={{ fontFamily:"inherit", fontWeight:400, fontSize:".85rem", color:"var(--p-text-2)", marginLeft:10 }}>
                      → {activeEst.ro.ro_number}
                    </span>
                  )}
                </p>
                <div style={{ display:"flex", gap:"8px", alignItems:"center", flexWrap:"wrap" }}>
                  <span className={`portalBadge ${statusClass(activeEst.status)}`}>
                    {STATUS_LABELS[activeEst.status] ?? activeEst.status}
                  </span>
                  {activeEst.customer && (
                    <span style={{ fontSize:".82rem", color:"var(--p-text-2)" }}>
                      {fullName(activeEst.customer)} — {vehicleLabel(activeEst.vehicle)}
                    </span>
                  )}
                  <span style={{ fontSize:".75rem", color:"var(--p-text-3)" }}>
                    Created {fmtDate(activeEst.created_at)}
                  </span>
                </div>
              </div>

              {/* Status actions */}
              <div className="portalApptStatusActions" style={{ marginLeft:"auto" }}>
                <span className="label">Status:</span>
                {["draft","sent","approved","declined","cancelled"].map((s) => (
                  <button key={s}
                    className={`portalBtnStatus${activeEst.status === s ? " active" : ""}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={changingStatus || activeEst.status === s || activeEst.status === "cancelled"}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Meta: title + customer message */}
            <div className="portalCard" style={{ marginBottom:"20px" }}>
              <p className="portalCardTitle">Estimate Details</p>
              <div className="portalEstMetaGrid">
                <div className="portalFormField">
                  <label className="portalFormLabel">Title</label>
                  <input className="portalFormInput" value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={saveMeta}
                    placeholder="Estimate title shown to customer" />
                </div>
                <div className="portalFormField">
                  <label className="portalFormLabel">Customer Message</label>
                  <textarea className="portalInspNoteTextarea" rows={2} value={localMsg}
                    onChange={(e) => setLocalMsg(e.target.value)}
                    onBlur={saveMeta}
                    placeholder="Message shown with approval link…" />
                </div>
              </div>
              {savingMeta && <p style={{ fontSize:".72rem", color:"var(--p-text-3)" }}>Saving…</p>}
            </div>

            {/* Line items — flat mode (no job sections) */}
            {jobs.length === 0 && (
              <div className="portalCard" style={{ padding:0, overflow:"hidden", marginBottom:"16px" }}>
                <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--p-border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
                  <p style={{ margin:0, fontWeight:700, fontSize:".82rem", textTransform:"uppercase", letterSpacing:"1px", color:"var(--p-text-2)" }}>
                    Line Items
                  </p>
                  <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                    <button className="portalBtn portalBtnSecondary" style={{ padding:"7px 14px", fontSize:".82rem" }}
                      onClick={openAddJobModal} disabled={activeEst.status === "cancelled"}
                      title="Create a named job section to group line items">
                      <i className="fa-solid fa-layer-group"></i> New Job Group
                    </button>
                    <button className="portalBtn portalBtnSecondary" style={{ padding:"7px 14px", fontSize:".82rem" }}
                      onClick={() => openPresetModal(null)} disabled={activeEst.status === "cancelled"}
                      title="Add a preset job bundle">
                      <i className="fa-solid fa-bolt"></i> Add Preset Job
                    </button>
                    <button className="portalBtn portalBtnPrimary" style={{ padding:"7px 16px", fontSize:".82rem" }}
                      onClick={() => openAddModal(null)} disabled={activeEst.status === "cancelled"}>
                      <i className="fa-solid fa-plus"></i> Add Item
                    </button>
                  </div>
                </div>
                {items.length === 0 ? (
                  <div className="portalEmptyState" style={{ padding:"32px 20px" }}>
                    <p style={{ color:"var(--p-text-3)", margin:0 }}>No items yet. Click Add Item to begin building this estimate.</p>
                  </div>
                ) : (
                  <ItemTable items={items}
                    onEdit={openEditModal} onHide={handleHideItem}
                    disabled={activeEst.status === "cancelled"} />
                )}
              </div>
            )}

            {/* Line items — grouped mode (job sections exist) */}
            {jobs.length > 0 && (() => {
              const activeJobIds = new Set(jobs.map((j) => j.id));
              const ungrouped = items.filter((i) => !i.estimate_job_id || !activeJobIds.has(i.estimate_job_id));
              const isCancelled = activeEst.status === "cancelled";
              return (
                <div className="portalCard" style={{ padding:0, overflow:"hidden", marginBottom:"16px" }}>
                  {/* Header */}
                  <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--p-border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
                    <p style={{ margin:0, fontWeight:700, fontSize:".82rem", textTransform:"uppercase", letterSpacing:"1px", color:"var(--p-text-2)" }}>
                      Job Sections
                    </p>
                    <button className="portalBtn portalBtnSecondary" style={{ padding:"7px 14px", fontSize:".82rem" }}
                      onClick={openAddJobModal} disabled={isCancelled}
                      title="Create a new named job section">
                      <i className="fa-solid fa-layer-group"></i> New Job Group
                    </button>
                  </div>

                  {/* One section per active job */}
                  {jobs.map((job) => {
                    const jobItems = items.filter((i) => i.estimate_job_id === job.id);
                    return (
                      <div key={job.id} className="estJobSection">
                        <div className="estJobHeader">
                          <div className="estJobTitleRow">
                            <input
                              className="estJobTitleInput"
                              value={job.title}
                              onChange={(e) => handleJobTitleChange(job.id, e.target.value)}
                              onBlur={() => handleJobBlur(job)}
                              disabled={isCancelled}
                              aria-label="Job section title"
                            />
                            <div className="estJobActions">
                              <button className="portalBtn portalBtnSecondary" style={{ padding:"5px 10px", fontSize:".78rem" }}
                                onClick={() => openPresetModal(job.id)} disabled={isCancelled}
                                title="Add a preset job bundle to this section">
                                <i className="fa-solid fa-bolt"></i> Preset
                              </button>
                              <button className="portalBtn portalBtnPrimary" style={{ padding:"5px 10px", fontSize:".78rem" }}
                                onClick={() => openAddModal(job.id)} disabled={isCancelled}>
                                <i className="fa-solid fa-plus"></i> Add Item
                              </button>
                              <button className="portalBtnIcon" title="Hide job section"
                                onClick={() => handleHideJob(job.id)} disabled={isCancelled}
                                style={{ color:"var(--p-text-3)" }}>
                                <i className="fa-solid fa-eye-slash"></i>
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="estJobNotesInput"
                            value={job.notes ?? ""}
                            onChange={(e) => handleJobNotesChange(job.id, e.target.value)}
                            onBlur={() => handleJobBlur(job)}
                            placeholder="Notes for this job section (staff only)…"
                            rows={1}
                            disabled={isCancelled}
                          />
                        </div>
                        {jobItems.length === 0 ? (
                          <div style={{ padding:"10px 20px", fontSize:".82rem", color:"var(--p-text-3)", fontStyle:"italic" }}>
                            No items yet — click Add Item above.
                          </div>
                        ) : (
                          <ItemTable items={jobItems}
                            onEdit={openEditModal} onHide={handleHideItem}
                            disabled={isCancelled} />
                        )}
                      </div>
                    );
                  })}

                  {/* Ungrouped items section */}
                  <div className="estJobSection estJobUngrouped">
                    <div className="estJobHeader">
                      <div className="estJobTitleRow">
                        <span className="estJobUngroupedTitle">Ungrouped Items</span>
                        <div className="estJobActions">
                          <button className="portalBtn portalBtnSecondary" style={{ padding:"5px 10px", fontSize:".78rem" }}
                            onClick={() => openPresetModal(null)} disabled={isCancelled}
                            title="Add a preset bundle as ungrouped items">
                            <i className="fa-solid fa-bolt"></i> Preset
                          </button>
                          <button className="portalBtn portalBtnPrimary" style={{ padding:"5px 10px", fontSize:".78rem" }}
                            onClick={() => openAddModal(null)} disabled={isCancelled}>
                            <i className="fa-solid fa-plus"></i> Add Item
                          </button>
                        </div>
                      </div>
                    </div>
                    {ungrouped.length === 0 ? (
                      <div style={{ padding:"10px 20px", fontSize:".82rem", color:"var(--p-text-3)" }}>No ungrouped items.</div>
                    ) : (
                      <ItemTable items={ungrouped}
                        onEdit={openEditModal} onHide={handleHideItem}
                        disabled={isCancelled} />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Horizontal Totals Bar */}
            {totals && (
              <div className="portalEstTotalsBar">
                <div className="portalEstTotalsBarItem">
                  <span className="portalEstTotalsBarLabel">Subtotal</span>
                  <span className="portalEstTotalsBarValue">{fmtCents(totals.subtotal_cents)}</span>
                </div>
                <div className="portalEstTotalsBarSep" />
                <div className="portalEstTotalsBarItem">
                  <span className="portalEstTotalsBarLabel">GST (5%)</span>
                  <span className="portalEstTotalsBarValue">{fmtCents(totals.tax_cents)}</span>
                </div>
                <div className="portalEstTotalsBarSep" />
                <div className="portalEstTotalsBarItem portalEstTotalsBarTotal">
                  <span className="portalEstTotalsBarLabel">Total</span>
                  <span className="portalEstTotalsBarValue">{fmtCents(totals.total_cents)}</span>
                </div>
                {(totals.approved_total_cents ?? 0) > 0 && (
                  <>
                    <div className="portalEstTotalsBarSep" />
                    <div className="portalEstTotalsBarItem portalEstTotalsBarApproved">
                      <span className="portalEstTotalsBarLabel">Approved</span>
                      <span className="portalEstTotalsBarValue">{fmtCents(totals.approved_total_cents)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Customer Actions */}
            <div className="portalCard" style={{ background:"var(--p-bg)", marginBottom:"20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                <p className="portalCardTitle" style={{ margin:0 }}>Customer Actions</p>
                <button className="portalBtnIcon" onClick={openManageModal} title="Manage canned job presets"
                  style={{ fontSize:".75rem", padding:"4px 10px", color:"var(--p-text-3)", border:"1px solid var(--p-border)", borderRadius:"var(--p-radius-sm)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                  <i className="fa-solid fa-screwdriver-wrench"></i> Presets
                </button>
              </div>
              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                {activeEst.sent_at && (
                  <span style={{ fontSize:".78rem", color:"var(--p-text-2)" }}>
                    <i className="fa-solid fa-check" style={{ color:"var(--p-success)", marginRight:5 }}></i>
                    Sent {new Date(activeEst.sent_at).toLocaleDateString("en-CA", { month:"short", day:"numeric", year:"numeric" })}
                  </span>
                )}
                <button className="portalBtn portalBtnPrimary"
                  onClick={openSendModal} disabled={!canSendForApproval}>
                  <i className="fa-solid fa-paper-plane"></i>
                  {activeEst.status === "sent" ? " Resend Approval Email" : " Send for Approval"}
                </button>
                {estInvoice ? (
                  <button className="portalBtn portalBtnPrimary"
                    onClick={() => navigate("/portal/invoices", { state: { invoiceId: estInvoice.id } })}>
                    <i className="fa-solid fa-receipt"></i> View Invoice
                  </button>
                ) : (
                  <button className="portalBtn portalBtnSecondary"
                    onClick={handleCreateInvoice}
                    disabled={invLoading || activeEst.status === "cancelled" || (totals?.total_cents ?? 0) === 0}>
                    <i className="fa-solid fa-receipt"></i>
                    {invLoading ? " Creating…" : " Create Invoice Record"}
                  </button>
                )}
              </div>
              {!canSendForApproval && activeEst.status !== "approved" && (
                <p style={{ margin:"8px 0 0", fontSize:".73rem", color:"var(--p-text-3)", lineHeight:1.5 }}>
                  {items.length === 0 ? "Add at least one line item before sending." :
                   (totals?.total_cents ?? 0) === 0 ? "Total must be greater than $0." :
                   "Estimate cannot be sent in its current status."}
                </p>
              )}
              {activeEst.status === "approved" && (
                <p style={{ margin:"8px 0 0", fontSize:".73rem", color:"var(--p-success)", lineHeight:1.5 }}>
                  <i className="fa-solid fa-circle-check"></i> Customer has approved this estimate.
                </p>
              )}
            </div>

            {/* Item modals */}
            {addModal && (
              <ItemForm title="Add Line Item"
                formData={itemForm} formErrors={itemFormErrors}
                onChange={handleItemField} saving={savingItem}
                onSubmit={handleAddItem} onClose={closeItemModals} />
            )}
            {editModal && (
              <ItemForm title="Edit Line Item"
                formData={itemForm} formErrors={itemFormErrors}
                onChange={handleItemField} saving={savingItem}
                onSubmit={handleEditItem} onClose={closeItemModals} />
            )}
            {itemSaveError && (
              <div className="portalDemoBanner" style={{ marginTop:12, background:"var(--p-danger-bg)", borderColor:"#f4c0bc", color:"var(--p-danger)" }}>
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{itemSaveError}</span>
              </div>
            )}

            {/* ─── New Job Group modal ─────────────────────────── */}
            {addJobModal && (
              <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setAddJobModal(false)}>
                <div className="portalModalCard" style={{ maxWidth:"440px" }} role="dialog" aria-modal="true">
                  <div className="portalModalHeader">
                    <h2 className="portalModalTitle">
                      <i className="fa-solid fa-layer-group" style={{ marginRight:8, color:"var(--p-navy)" }}></i>
                      New Job Group
                    </h2>
                    <button className="portalModalClose" onClick={() => setAddJobModal(false)}>
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                  <form onSubmit={handleSaveNewJob} noValidate>
                    <div className="portalModalBody">
                      <div className="portalForm">
                        <div className="portalFormField">
                          <label className="portalFormLabel">Job Title<span className="req">*</span></label>
                          <input
                            className={`portalFormInput${newJobFormErrors.title ? " invalid" : ""}`}
                            type="text"
                            value={newJobForm.title}
                            onChange={(e) => { setNewJobForm((p) => ({ ...p, title: e.target.value })); if (newJobFormErrors.title) setNewJobFormErrors({}); }}
                            placeholder="e.g. Engine noise on startup"
                            autoFocus
                            autoComplete="off"
                          />
                          {newJobFormErrors.title && <p className="portalFormFieldError">{newJobFormErrors.title}</p>}
                        </div>
                        <div className="portalFormField">
                          <label className="portalFormLabel">Notes (optional — staff only)</label>
                          <textarea
                            className="portalFormTextarea"
                            rows={2}
                            value={newJobForm.notes}
                            onChange={(e) => setNewJobForm((p) => ({ ...p, notes: e.target.value }))}
                            placeholder="Internal notes for this job section…"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="portalModalFooter">
                      <button type="button" className="portalBtn portalBtnSecondary" onClick={() => setAddJobModal(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="portalBtn portalBtnPrimary" disabled={savingNewJob}>
                        {savingNewJob ? "Creating…" : "Create Job Group"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ─── Preset Job Picker modal ─────────────────────────── */}
            {presetModal && (
              <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setPresetModal(false)}>
                <div className="portalModalCard portalCannedModal" role="dialog" aria-modal="true">
                  <div className="portalModalHeader">
                    <h2 className="portalModalTitle"><i className="fa-solid fa-bolt" style={{ marginRight:8, color:"var(--p-navy)" }}></i>Add Preset Job</h2>
                    <button className="portalModalClose" onClick={() => setPresetModal(false)}><i className="fa-solid fa-xmark"></i></button>
                  </div>
                  <div className="portalModalBody portalCannedModalBody">
                    {presetError && <div className="portalModalError">{presetError}</div>}
                    <div className="portalCannedLayout">
                      {/* Left: job list */}
                      <div className="portalCannedSidebar">
                        <p className="portalCannedSidebarLabel">Preset Jobs</p>
                        {presetLoading ? (
                          <p style={{ padding:"12px", fontSize:".82rem", color:"var(--p-text-3)" }}>Loading…</p>
                        ) : cannedJobs.length === 0 ? (
                          <div style={{ padding:"12px", fontSize:".82rem", color:"var(--p-text-3)" }}>
                            No preset jobs yet.<br />
                            <button className="portalBtnLink" onClick={() => { setPresetModal(false); openManageModal(); }}>
                              Create one now →
                            </button>
                          </div>
                        ) : cannedJobs.map((job) => (
                          <button key={job.id}
                            className={`portalCannedJobBtn${previewJob?.id === job.id ? " selected" : ""}`}
                            onClick={() => selectPreviewJob(job)}>
                            <span className="portalCannedJobName">{job.name}</span>
                            {job.category && <span className="portalCannedJobCat">{job.category}</span>}
                          </button>
                        ))}
                      </div>

                      {/* Right: preview */}
                      <div className="portalCannedPreview">
                        {previewLoading ? (
                          <p style={{ padding:"20px", fontSize:".82rem", color:"var(--p-text-3)" }}>Loading preview…</p>
                        ) : previewJob ? (
                          <>
                            <p className="portalCannedPreviewTitle">{previewJob.name}</p>
                            {previewJob.description && (
                              <p style={{ margin:"0 0 12px", fontSize:".82rem", color:"var(--p-text-2)" }}>{previewJob.description}</p>
                            )}
                            {previewJob.items.length === 0 ? (
                              <p style={{ fontSize:".82rem", color:"var(--p-text-3)", fontStyle:"italic" }}>
                                This preset has no items yet. <button className="portalBtnLink" onClick={() => { setPresetModal(false); openManageModal(); }}>Add items →</button>
                              </p>
                            ) : (
                              <div style={{ overflowX:"auto" }}>
                                <table className="portalEstItemTable portalCannedPreviewTable">
                                  <thead>
                                    <tr>
                                      <th>Type</th>
                                      <th>Description</th>
                                      <th className="money">Qty</th>
                                      <th className="money">Customer Price</th>
                                      <th className="money">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {previewJob.items.map((item) => (
                                      <tr key={item.id}>
                                        <td><TypeBadge type={item.item_type} /></td>
                                        <td>
                                          <span style={{ fontWeight:600 }}>{item.description}</span>
                                          {item.is_required && <span style={{ marginLeft:6, fontSize:".65rem", fontWeight:700, color:"var(--p-warning)", textTransform:"uppercase" }}>Required</span>}
                                          {item.notes && <div style={{ fontSize:".75rem", color:"var(--p-text-3)", marginTop:2 }}>{item.notes}</div>}
                                        </td>
                                        <td className="money" style={{ color:"var(--p-text-2)" }}>{item.quantity}</td>
                                        <td className="money" style={{ color:"var(--p-text-2)" }}>{fmtCents(item.unit_price_cents)}</td>
                                        <td className="money" style={{ fontWeight:700 }}>{fmtCents(Math.round(item.quantity * item.unit_price_cents))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </>
                        ) : (
                          <p style={{ padding:"20px", fontSize:".82rem", color:"var(--p-text-3)" }}>
                            Select a preset job on the left to preview its items.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="portalModalFooter">
                    <button type="button" className="portalBtn portalBtnSecondary" onClick={() => setPresetModal(false)}>Cancel</button>
                    <button type="button" className="portalBtnLink" style={{ fontSize:".82rem", marginRight:"auto" }}
                      onClick={() => { setPresetModal(false); navigate("/portal/presets"); }}>
                      <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginRight:5, fontSize:".75rem" }}></i>Manage Presets
                    </button>
                    <button type="button" className="portalBtn portalBtnPrimary"
                      onClick={handleAddPreset}
                      disabled={!previewJob || !previewJob.items.length || addingPreset}>
                      {addingPreset ? "Adding…" : `Add to Estimate${previewJob ? ` (${previewJob.items.length} item${previewJob.items.length !== 1 ? "s" : ""})` : ""}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Manage Canned Jobs modal ─────────────────────────── */}
            {manageModal && (
              <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setManageModal(false)}>
                <div className="portalModalCard portalCannedModal" role="dialog" aria-modal="true">
                  <div className="portalModalHeader">
                    <h2 className="portalModalTitle"><i className="fa-solid fa-screwdriver-wrench" style={{ marginRight:8, color:"var(--p-navy)" }}></i>Manage Preset Jobs</h2>
                    <button className="portalModalClose" onClick={() => setManageModal(false)}><i className="fa-solid fa-xmark"></i></button>
                  </div>
                  <div className="portalModalBody portalCannedModalBody">
                    {manageError && <div className="portalModalError">{manageError}</div>}
                    <div className="portalCannedLayout">

                      {/* Left: job list */}
                      <div className="portalCannedSidebar">
                        <p className="portalCannedSidebarLabel">Jobs</p>
                        {manageLoading && !manageSel ? (
                          <p style={{ padding:"12px", fontSize:".82rem", color:"var(--p-text-3)" }}>Loading…</p>
                        ) : allCannedJobs.map((job) => (
                          <button key={job.id}
                            className={`portalCannedJobBtn${manageSel?.id === job.id ? " selected" : ""}${!job.is_active ? " inactive" : ""}`}
                            onClick={() => selectManageJob(job)}>
                            <span className="portalCannedJobName">{job.name}</span>
                            {!job.is_active && <span className="portalCannedJobCat" style={{ color:"var(--p-text-3)" }}>Inactive</span>}
                            {job.is_active && job.category && <span className="portalCannedJobCat">{job.category}</span>}
                          </button>
                        ))}
                        <button className={`portalCannedJobBtn${!manageSel ? " selected" : ""}`}
                          onClick={() => { setManageSel(null); setManageJobForm({ name:"", description:"", category:"", sort_order:"0" }); setManageJobErrors({}); setAddItemToJobMode(false); setEditingJobItem(null); }}
                          style={{ borderTop:"1px dashed var(--p-border)", marginTop:4, paddingTop:8, color:"var(--p-success)" }}>
                          <i className="fa-solid fa-plus" style={{ marginRight:6 }}></i> New Job
                        </button>
                      </div>

                      {/* Right: job editor */}
                      <div className="portalCannedPreview">
                        <form onSubmit={handleSaveCannedJob} noValidate>
                          <div className="portalCannedManageSection">
                            <p className="portalCannedPreviewTitle">{manageSel ? "Edit Job" : "New Preset Job"}</p>
                            <div className="portalForm" style={{ maxWidth:"100%" }}>
                              <div className="portalFormRow">
                                <div className="portalFormField" style={{ flex:2 }}>
                                  <label className="portalFormLabel">Name<span className="req">*</span></label>
                                  <input className={`portalFormInput${manageJobErrors.name ? " invalid" : ""}`}
                                    value={manageJobForm.name} onChange={(e) => setManageJobForm((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Brake Service" />
                                  {manageJobErrors.name && <p className="portalFormFieldError">{manageJobErrors.name}</p>}
                                </div>
                                <div className="portalFormField" style={{ flex:1 }}>
                                  <label className="portalFormLabel">Category</label>
                                  <input className="portalFormInput"
                                    value={manageJobForm.category} onChange={(e) => setManageJobForm((p) => ({ ...p, category: e.target.value }))}
                                    placeholder="e.g. Brakes" />
                                </div>
                                <div className="portalFormField" style={{ flex:"0 0 80px" }}>
                                  <label className="portalFormLabel">Order</label>
                                  <input className="portalFormInput" type="number" min="0"
                                    value={manageJobForm.sort_order} onChange={(e) => setManageJobForm((p) => ({ ...p, sort_order: e.target.value }))} />
                                </div>
                              </div>
                              <div className="portalFormField">
                                <label className="portalFormLabel">Description (optional)</label>
                                <textarea className="portalFormTextarea" rows={2}
                                  value={manageJobForm.description} onChange={(e) => setManageJobForm((p) => ({ ...p, description: e.target.value }))}
                                  placeholder="Short description shown in the preset picker…" />
                              </div>
                              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                                <button type="submit" className="portalBtn portalBtnPrimary" style={{ padding:"7px 16px", fontSize:".82rem" }}
                                  disabled={savingJob}>
                                  {savingJob ? "Saving…" : manageSel ? "Save Changes" : "Create Job"}
                                </button>
                                {manageSel && (
                                  manageSel.is_active ? (
                                    <button type="button" className="portalBtn portalBtnSecondary" style={{ padding:"7px 14px", fontSize:".82rem", color:"var(--p-danger)" }}
                                      onClick={() => handleHideCannedJob(manageSel)}>
                                      Deactivate
                                    </button>
                                  ) : (
                                    <button type="button" className="portalBtn portalBtnSecondary" style={{ padding:"7px 14px", fontSize:".82rem", color:"var(--p-success)" }}
                                      onClick={() => handleReactivateCannedJob(manageSel)}>
                                      Reactivate
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </form>

                        {/* Items for this job */}
                        {manageSel && (
                          <div className="portalCannedManageSection" style={{ marginTop:"16px" }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                              <p className="portalCannedPreviewTitle" style={{ margin:0 }}>Line Items</p>
                              {!addItemToJobMode && !editingJobItem && (
                                <button type="button" className="portalBtn portalBtnPrimary" style={{ padding:"5px 12px", fontSize:".78rem" }}
                                  onClick={() => { setAddItemToJobMode(true); setManageItemForm({ ...EMPTY_ITEM_FORM, sort_order:"0" }); setManageItemErrors({}); }}>
                                  <i className="fa-solid fa-plus"></i> Add Item
                                </button>
                              )}
                            </div>

                            {/* Item list */}
                            {(manageSel.items?.length ?? 0) === 0 && !addItemToJobMode && (
                              <p style={{ fontSize:".82rem", color:"var(--p-text-3)", fontStyle:"italic" }}>No items yet. Add items above.</p>
                            )}
                            {(manageSel.items ?? []).map((item) => (
                              editingJobItem?.id === item.id ? (
                                <form key={item.id} onSubmit={handleSaveCannedJobItem} noValidate className="portalCannedItemEditRow">
                                  <div className="portalForm" style={{ maxWidth:"100%" }}>
                                    <div className="portalFormRow">
                                      <div className="portalFormField" style={{ flex:"0 0 110px" }}>
                                        <label className="portalFormLabel">Type</label>
                                        <select className="portalFormSelect" name="item_type" value={manageItemForm.item_type} onChange={handleManageItemField}>
                                          {Object.entries(ITEM_TYPE_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                                        </select>
                                      </div>
                                      <div className="portalFormField" style={{ flex:3 }}>
                                        <label className="portalFormLabel">Description<span className="req">*</span></label>
                                        <input className={`portalFormInput${manageItemErrors.description ? " invalid" : ""}`}
                                          name="description" value={manageItemForm.description} onChange={handleManageItemField} />
                                        {manageItemErrors.description && <p className="portalFormFieldError">{manageItemErrors.description}</p>}
                                      </div>
                                      <div className="portalFormField" style={{ flex:"0 0 70px" }}>
                                        <label className="portalFormLabel">Qty</label>
                                        <input className="portalFormInput" name="quantity" type="number" min="0" step="0.5"
                                          value={manageItemForm.quantity} onChange={handleManageItemField} />
                                      </div>
                                    </div>
                                    <div className="portalItemPricingSection">
                                      <p className="portalItemPricingLabel"><i className="fa-solid fa-lock" style={{ fontSize:".65rem", marginRight:5, opacity:.7 }}></i>Staff-Only Pricing</p>
                                      <div className="portalFormRow">
                                        <div className="portalFormField">
                                          <label className="portalFormLabel">Cost ($)</label>
                                          <input className="portalFormInput" name="cost_dollars" type="number" min="0" step="0.01"
                                            value={manageItemForm.cost_dollars} onChange={handleManageItemField} placeholder="0.00" />
                                        </div>
                                        <div className="portalFormField">
                                          <label className="portalFormLabel">Markup (%)</label>
                                          <input className="portalFormInput" name="markup_percent" type="number" min="0" step="0.1"
                                            value={manageItemForm.markup_percent} onChange={handleManageItemField} placeholder="0" />
                                        </div>
                                        <div className="portalFormField">
                                          <label className="portalFormLabel">Customer Price ($)</label>
                                          <input className={`portalFormInput${manageItemErrors.unit_price_dollars ? " invalid" : ""}`}
                                            name="unit_price_dollars" type="number" min="0" step="0.01"
                                            value={manageItemForm.unit_price_dollars} onChange={handleManageItemField} />
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display:"flex", gap:"8px" }}>
                                      <button type="submit" className="portalBtn portalBtnPrimary" style={{ padding:"6px 14px", fontSize:".8rem" }}
                                        disabled={savingManageItem}>{savingManageItem ? "Saving…" : "Save"}</button>
                                      <button type="button" className="portalBtn portalBtnSecondary" style={{ padding:"6px 14px", fontSize:".8rem" }}
                                        onClick={() => { setEditingJobItem(null); setManageItemForm({ ...EMPTY_ITEM_FORM, sort_order:"0" }); }}>Cancel</button>
                                    </div>
                                  </div>
                                </form>
                              ) : (
                                <div key={item.id} className="portalCannedItemRow">
                                  <TypeBadge type={item.item_type} />
                                  <span style={{ flex:1, fontWeight:600, fontSize:".85rem" }}>{item.description}</span>
                                  <span style={{ color:"var(--p-text-3)", fontSize:".78rem" }}>×{item.quantity}</span>
                                  <span style={{ fontFamily:"monospace", fontSize:".85rem", color:"var(--p-navy)", fontWeight:700 }}>{fmtCents(item.unit_price_cents)}</span>
                                  {item.cost_cents != null && (
                                    <span className="portalItemCostHint" style={{ margin:0 }}>Cost: {fmtCents(item.cost_cents)}{item.markup_percent != null ? ` +${item.markup_percent}%` : ""}</span>
                                  )}
                                  <button className="portalBtnIcon" onClick={() => openEditJobItem(item)} title="Edit" disabled={editingJobItem || addItemToJobMode}>
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                </div>
                              )
                            ))}

                            {/* Add item inline form */}
                            {addItemToJobMode && (
                              <form onSubmit={handleSaveCannedJobItem} noValidate className="portalCannedItemEditRow">
                                <div className="portalForm" style={{ maxWidth:"100%" }}>
                                  <div className="portalFormRow">
                                    <div className="portalFormField" style={{ flex:"0 0 110px" }}>
                                      <label className="portalFormLabel">Type</label>
                                      <select className="portalFormSelect" name="item_type" value={manageItemForm.item_type} onChange={handleManageItemField}>
                                        {Object.entries(ITEM_TYPE_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                                      </select>
                                    </div>
                                    <div className="portalFormField" style={{ flex:3 }}>
                                      <label className="portalFormLabel">Description<span className="req">*</span></label>
                                      <input className={`portalFormInput${manageItemErrors.description ? " invalid" : ""}`}
                                        name="description" value={manageItemForm.description} onChange={handleManageItemField}
                                        placeholder="e.g. Replace front brake pads — labour" autoFocus />
                                      {manageItemErrors.description && <p className="portalFormFieldError">{manageItemErrors.description}</p>}
                                    </div>
                                    <div className="portalFormField" style={{ flex:"0 0 70px" }}>
                                      <label className="portalFormLabel">Qty</label>
                                      <input className="portalFormInput" name="quantity" type="number" min="0" step="0.5"
                                        value={manageItemForm.quantity} onChange={handleManageItemField} />
                                    </div>
                                  </div>
                                  <div className="portalItemPricingSection">
                                    <p className="portalItemPricingLabel"><i className="fa-solid fa-lock" style={{ fontSize:".65rem", marginRight:5, opacity:.7 }}></i>Staff-Only Pricing</p>
                                    <div className="portalFormRow">
                                      <div className="portalFormField">
                                        <label className="portalFormLabel">Cost ($)</label>
                                        <input className="portalFormInput" name="cost_dollars" type="number" min="0" step="0.01"
                                          value={manageItemForm.cost_dollars} onChange={handleManageItemField} placeholder="0.00" />
                                      </div>
                                      <div className="portalFormField">
                                        <label className="portalFormLabel">Markup (%)</label>
                                        <input className="portalFormInput" name="markup_percent" type="number" min="0" step="0.1"
                                          value={manageItemForm.markup_percent} onChange={handleManageItemField} placeholder="0" />
                                      </div>
                                      <div className="portalFormField">
                                        <label className="portalFormLabel">Customer Price ($)</label>
                                        <input className={`portalFormInput${manageItemErrors.unit_price_dollars ? " invalid" : ""}`}
                                          name="unit_price_dollars" type="number" min="0" step="0.01"
                                          value={manageItemForm.unit_price_dollars} onChange={handleManageItemField} />
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display:"flex", gap:"8px" }}>
                                    <button type="submit" className="portalBtn portalBtnPrimary" style={{ padding:"6px 14px", fontSize:".8rem" }}
                                      disabled={savingManageItem}>{savingManageItem ? "Saving…" : "Add Item"}</button>
                                    <button type="button" className="portalBtn portalBtnSecondary" style={{ padding:"6px 14px", fontSize:".8rem" }}
                                      onClick={() => { setAddItemToJobMode(false); setManageItemForm({ ...EMPTY_ITEM_FORM, sort_order:"0" }); }}>Cancel</button>
                                  </div>
                                </div>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="portalModalFooter">
                    <button type="button" className="portalBtn portalBtnPrimary" onClick={() => setManageModal(false)}>Done</button>
                  </div>
                </div>
              </div>
            )}

            {/* Send for Approval modal */}
            {sendModal && (
              <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setSendModal(false)}>
                <div className="portalModalCard" style={{ maxWidth:"460px" }} role="dialog" aria-modal="true">
                  <div className="portalModalHeader">
                    <h2 className="portalModalTitle">Send Estimate for Approval</h2>
                    <button className="portalModalClose" onClick={() => setSendModal(false)}><i className="fa-solid fa-xmark"></i></button>
                  </div>
                  {sendSuccess ? (
                    <div className="portalModalBody" style={{ textAlign:"center", padding:"32px 24px" }}>
                      <i className="fa-solid fa-circle-check" style={{ fontSize:"2rem", color:"var(--p-success)", marginBottom:12, display:"block" }}></i>
                      <p style={{ fontWeight:700, color:"var(--p-text)", margin:"0 0 8px" }}>Approval email sent!</p>
                      <p style={{ fontSize:".85rem", color:"var(--p-text-2)", margin:0 }}>
                        The customer will receive a secure link valid for 7 days.
                      </p>
                      <button className="portalBtn portalBtnPrimary" style={{ marginTop:20 }} onClick={() => setSendModal(false)}>
                        Done
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSendForApproval} noValidate>
                      <div className="portalModalBody">
                        {sendError && <div className="portalModalError">{sendError}</div>}
                        <div className="portalForm">
                          <div style={{ padding:"12px 14px", background:"var(--p-bg)", border:"1px solid var(--p-border)", borderRadius:"var(--p-radius-sm)", marginBottom:4, fontSize:".85rem" }}>
                            <strong>{activeEst.estimate_number}</strong>
                            {activeEst.ro?.ro_number && <span style={{ color:"var(--p-text-2)", marginLeft:8 }}>→ {activeEst.ro.ro_number}</span>}
                            <span style={{ display:"block", color:"var(--p-text-2)", marginTop:2 }}>Total: <strong>{fmtCents(totals?.total_cents)}</strong></span>
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Customer Email<span className="req">*</span></label>
                            <input className="portalFormInput" type="email" autoComplete="email"
                              value={sendEmail} onChange={(e) => setSendEmail(e.target.value)}
                              placeholder="customer@example.com" disabled={sending} />
                          </div>
                          <div className="portalFormField">
                            <label className="portalFormLabel">Message to Customer (optional)</label>
                            <textarea className="portalFormTextarea" rows={3}
                              value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                              placeholder="Any note to include with the estimate email…"
                              disabled={sending} />
                          </div>
                          <p style={{ margin:0, fontSize:".75rem", color:"var(--p-text-3)", lineHeight:1.5 }}>
                            <i className="fa-solid fa-lock" style={{ marginRight:5 }}></i>
                            A secure approval link will be emailed to the customer. The link expires in 7 days.
                            No payment is collected at this step.
                          </p>
                        </div>
                      </div>
                      <div className="portalModalFooter">
                        <button type="button" className="portalBtn portalBtnSecondary" onClick={() => setSendModal(false)} disabled={sending}>Cancel</button>
                        <button type="submit" className="portalBtn portalBtnPrimary" disabled={sending}>
                          {sending ? "Sending…" : "Send Approval Email"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="portalEmptyState">
            <p>Could not load estimate.</p>
            <button className="portalBtn portalBtnSecondary" onClick={backToList}>Back to list</button>
          </div>
        )}
      </PortalLayout>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     LIST VIEW
     ═══════════════════════════════════════════════════════════ */
  return (
    <PortalLayout title="Estimates">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Estimates</h2>
          <p className="portalPageDesc">Build line-item estimates for customer approval. Start from a repair order.</p>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"16px" }}>
        <div className="portalToolbar" style={{ marginBottom:0 }}>
          <div className="portalSearchBar">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input className="portalSearchInput"
              placeholder="Search by estimate #, RO #, customer, or vehicle…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize:".82rem", color:"var(--p-text-3)" }}>
              {filtered.length} estimate{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="portalFilterTabs" style={{ flexWrap:"wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <button key={s}
              className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span style={{ marginLeft:5, fontSize:".7rem", opacity:.7 }}>
                {s === "all" ? estimates.length : (counts[s] || "")}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="portalCard" style={{ padding:0, overflow:"hidden" }}>
        {loading ? (
          <div className="portalEmptyState"><p style={{ color:"var(--p-text-3)" }}>Loading estimates…</p></div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load estimates</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={loadList}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-file-invoice-dollar" style={{ opacity:.25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search || statusFilter !== "all" ? "No estimates match your filters" : "No estimates yet"}
            </p>
            <p className="portalEmptyDesc">
              {search || statusFilter !== "all"
                ? "Try clearing the search or changing the filter."
                : "Open a repair order and click Create Estimate to get started."}
            </p>
          </div>
        ) : (
          <table className="portalTable">
            <thead>
              <tr>
                <th>Estimate #</th>
                <th>RO #</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th style={{ textAlign:"right" }}>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((est) => {
                const ro = est.repair_orders;
                return (
                  <tr key={est.id} onClick={() => openBuilderById(est.id)} style={{ cursor:"pointer" }}>
                    <td style={{ fontFamily:"monospace", fontWeight:700, color:"var(--p-navy)", fontSize:".88rem" }}>
                      {est.estimate_number}
                    </td>
                    <td style={{ fontFamily:"monospace", fontSize:".83rem", color:"var(--p-text-2)" }}>
                      {ro?.ro_number ?? "—"}
                    </td>
                    <td style={{ fontWeight:600 }}>
                      {ro?.customers ? `${ro.customers.first_name} ${ro.customers.last_name}` : "—"}
                    </td>
                    <td style={{ fontSize:".85rem", color:"var(--p-text-2)" }}>
                      {ro?.vehicles ? [ro.vehicles.year, ro.vehicles.make, ro.vehicles.model].filter(Boolean).join(" ") : "—"}
                    </td>
                    <td>
                      <span className={`portalBadge ${statusClass(est.status)}`}>
                        {STATUS_LABELS[est.status] ?? est.status}
                      </span>
                    </td>
                    <td style={{ textAlign:"right", fontFamily:"monospace", fontWeight:600, fontSize:".88rem", color:"var(--p-navy)" }}>
                      {fmtCents(est.total_cents)}
                    </td>
                    <td style={{ fontSize:".83rem", color:"var(--p-text-3)", whiteSpace:"nowrap" }}>
                      {fmtDate(est.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PortalLayout>
  );
}
