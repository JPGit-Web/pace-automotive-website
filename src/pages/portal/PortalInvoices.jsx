import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import InvoicePrintView from "../../components/portal/InvoicePrintView";
import { supabase } from "../../lib/supabase";
import {
  listHelcimInvoices, getHelcimInvoice,
  updateHelcimInvoice, updateHelcimInvoiceStatus, updateHelcimPaymentStatus,
  createManualHelcimInvoice, listRepairOrders, logActivity,
} from "../../lib/portalData";

/* ── Constants ─────────────────────────────────────────────── */
const INV_STATUS_LABELS = {
  draft: "Draft", created: "Created", sent: "Sent", viewed: "Viewed",
  voided: "Voided", cancelled: "Cancelled", archived: "Archived",
};
const PAY_STATUS_LABELS = {
  unpaid: "Unpaid", partial: "Partial", paid: "Paid",
  refunded: "Refunded", failed: "Failed", voided: "Voided",
};
const STATUS_FILTERS = ["all","draft","created","sent","viewed","voided","cancelled","archived"];
const PAY_FILTERS    = ["all","unpaid","partial","paid","refunded","failed","voided"];

const EMPTY_FORM = {
  repair_order_id: "", helcim_invoice_id: "", helcim_invoice_number: "",
  helcim_customer_id: "", helcim_payment_link: "",
  status: "draft", payment_status: "unpaid",
  subtotal_cents: "", tax_cents: "", total_cents: "",
  issued_at: "", due_at: "", notes: "",
};

/* ── Helpers ─────────────────────────────────────────────────── */
const statusClass  = (s) => s ?? "draft";
const payClass     = (s) => s ?? "unpaid";
const fmtCents     = (c) => c != null ? "$" + (c / 100).toFixed(2) : "—";
const fmtDate      = (iso) => iso ? new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" }) : "—";
const fullName     = (c) => c ? `${c.first_name} ${c.last_name}` : "—";
const vehicleLabel = (v) => v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "—";
const dollarsToCents = (d) => Math.round((parseFloat(d) || 0) * 100);

/* ── Detail field ── */
function DField({ label, value, mono = false }) {
  return (
    <div>
      <div className="portalDetailLabel">{label}</div>
      <div className={`portalDetailValue${!value ? " empty" : ""}`}
        style={{ fontFamily: mono ? "monospace" : "inherit" }}>
        {value || "—"}
      </div>
    </div>
  );
}

/* ============================================================ */
export default function PortalInvoices() {
  const location = useLocation();

  /* ── List state ── */
  const [invoices,      setInvoices]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [payFilter,     setPayFilter]     = useState("all");

  /* ── Detail state ── */
  const [selected,      setSelected]      = useState(null);  // full invoice w/ joins
  const [detailLoading, setDetailLoading] = useState(false);
  const [changingStatus,setChangingStatus]= useState(false);
  const [changingPay,   setChangingPay]   = useState(false);
  const [partialModal,  setPartialModal]  = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  /* ── Create modal ── */
  const [createModal,   setCreateModal]   = useState(false);
  const [formData,      setFormData]      = useState({ ...EMPTY_FORM });
  const [formErrors,    setFormErrors]    = useState({});
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState("");
  const [allRos,        setAllRos]        = useState([]);

  /* ── Helcim API creation ── */
  const [helcimCreating, setHelcimCreating] = useState(false);
  const [helcimError,    setHelcimError]    = useState("");
  const [helcimSuccess,  setHelcimSuccess]  = useState("");

  /* ── Edit modal ── */
  const [editModal,     setEditModal]     = useState(false);
  const [editForm,      setEditForm]      = useState({});
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState("");

  /* ── Load list ── */
  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try { setInvoices(await listHelcimInvoices()); }
    catch { setError("Failed to load invoices. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  /* ── Auto-open from navigation state ── */
  useEffect(() => {
    const id = location.state?.invoiceId;
    if (!id) return;
    openDetailById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.invoiceId]);

  async function openDetailById(id) {
    setDetailLoading(true);
    setHelcimError("");
    setHelcimSuccess("");
    try {
      const inv = await getHelcimInvoice(id);
      setSelected(inv);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[PortalInvoices] detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!selected) return;
    await openDetailById(selected.id);
    await loadList();
  }

  /* ── Filter ── */
  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (payFilter !== "all" && inv.payment_status !== payFilter) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    const ro = inv.repair_orders;
    return (
      inv.helcim_invoice_number?.toLowerCase().includes(t) ||
      inv.helcim_invoice_id?.toLowerCase().includes(t) ||
      ro?.ro_number?.toLowerCase().includes(t) ||
      ro?.customers?.first_name?.toLowerCase().includes(t) ||
      ro?.customers?.last_name?.toLowerCase().includes(t) ||
      ro?.vehicles?.make?.toLowerCase().includes(t) ||
      ro?.vehicles?.model?.toLowerCase().includes(t) ||
      inv.payment_status?.includes(t)
    );
  });

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!selected || changingStatus) return;
    if (newStatus === "voided" &&
        !window.confirm(`Void invoice ${selected.helcim_invoice_number || selected.id.slice(0,8)}? This cannot be undone easily.`)) return;
    setChangingStatus(true);
    try {
      await updateHelcimInvoiceStatus(selected.id, newStatus);
      await logActivity("invoice.status_changed", "helcim_invoice", selected.id, {
        from: selected.status, to: newStatus,
      });
      await refreshDetail();
    } catch { alert("Failed to update status."); }
    finally { setChangingStatus(false); }
  }

  /* ── Payment status change ── */
  async function handlePaymentStatus(newPay, extraData = {}) {
    if (!selected || changingPay) return;
    setChangingPay(true);
    try {
      await updateHelcimPaymentStatus(selected.id, newPay, extraData);
      await logActivity(
        newPay === "paid" ? "invoice.marked_paid"
          : newPay === "voided" ? "invoice.voided"
          : "invoice.payment_status_changed",
        "helcim_invoice", selected.id,
        { payment_status: newPay, ...extraData }
      );
      await refreshDetail();
      setPartialModal(false);
      setPartialAmount("");
    } catch { alert("Failed to update payment status."); }
    finally { setChangingPay(false); }
  }

  /* ── Open create modal ── */
  async function openCreateModal() {
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setSaveError("");
    setCreateModal(true);
    const ros = await listRepairOrders().catch(() => []);
    setAllRos(ros);
  }

  function handleFormField(e) {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.repair_order_id) { setFormErrors({ repair_order_id: "Repair order required." }); return; }
    setSaving(true); setSaveError("");
    try {
      const payload = {
        repair_order_id:       formData.repair_order_id,
        helcim_invoice_id:     formData.helcim_invoice_id     || null,
        helcim_invoice_number: formData.helcim_invoice_number || null,
        helcim_customer_id:    formData.helcim_customer_id    || null,
        helcim_payment_link:   formData.helcim_payment_link   || null,
        status:                formData.status                || "draft",
        payment_status:        formData.payment_status        || "unpaid",
        subtotal_cents: formData.subtotal_cents ? dollarsToCents(formData.subtotal_cents) : 0,
        tax_cents:      formData.tax_cents      ? dollarsToCents(formData.tax_cents)      : 0,
        total_cents:    formData.total_cents    ? dollarsToCents(formData.total_cents)    : 0,
        amount_due_cents: formData.total_cents  ? dollarsToCents(formData.total_cents)    : 0,
        issued_at: formData.issued_at || null,
        due_at:    formData.due_at    || null,
        notes:     formData.notes     || null,
      };
      const inv = await createManualHelcimInvoice(payload);
      await logActivity("invoice.created", "helcim_invoice", inv.id, { manual: true });
      setInvoices((p) => [inv, ...p]);
      setCreateModal(false);
      await openDetailById(inv.id);
    } catch { setSaveError("Failed to create invoice. Please try again."); }
    finally { setSaving(false); }
  }

  /* ── Open edit modal ── */
  function openEditModal() {
    if (!selected) return;
    setEditForm({
      helcim_invoice_id:     selected.helcim_invoice_id     ?? "",
      helcim_invoice_number: selected.helcim_invoice_number ?? "",
      helcim_customer_id:    selected.helcim_customer_id    ?? "",
      helcim_payment_link:   selected.helcim_payment_link   ?? "",
      notes:                 selected.notes                 ?? "",
      issued_at: selected.issued_at?.slice(0,10) ?? "",
      due_at:    selected.due_at?.slice(0,10)    ?? "",
    });
    setEditError("");
    setEditModal(true);
  }

  function handleEditField(e) {
    const { name, value } = e.target;
    setEditForm((p) => ({ ...p, [name]: value }));
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true); setEditError("");
    try {
      await updateHelcimInvoice(selected.id, {
        helcim_invoice_id:     editForm.helcim_invoice_id     || null,
        helcim_invoice_number: editForm.helcim_invoice_number || null,
        helcim_customer_id:    editForm.helcim_customer_id    || null,
        helcim_payment_link:   editForm.helcim_payment_link   || null,
        notes:                 editForm.notes                 || null,
        issued_at: editForm.issued_at || null,
        due_at:    editForm.due_at    || null,
      });
      await logActivity("invoice.updated", "helcim_invoice", selected.id, {});
      await refreshDetail();
      setEditModal(false);
    } catch { setEditError("Failed to save. Please try again."); }
    finally { setEditSaving(false); }
  }

  /* ── Create in Helcim ── */
  async function handleHelcimCreate() {
    if (!selected) return;
    setHelcimCreating(true);
    setHelcimError("");
    setHelcimSuccess("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const res = await fetch("/.netlify/functions/helcim-create-invoice", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ invoiceId: selected.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHelcimError(data.message || "Failed to create Helcim invoice.");
        return;
      }
      setHelcimSuccess(
        data.helcim_invoice_number
          ? `Invoice created in Helcim: ${data.helcim_invoice_number}`
          : "Invoice created in Helcim successfully."
      );
      // Refresh detail to show updated Helcim fields
      await refreshDetail();
    } catch (err) {
      if (import.meta.env.DEV) console.error("[handleHelcimCreate]", err);
      setHelcimError("Failed to reach server. Please try again.");
    } finally {
      setHelcimCreating(false);
    }
  }

  // Whether this invoice can be created in Helcim
  const canCreateInHelcim = selected &&
    !selected.helcim_invoice_id &&
    (selected.total_cents ?? 0) > 0 &&
    selected.repair_order_id &&
    !["voided","cancelled","archived"].includes(selected.status);

  function copyLink() {
    if (selected?.helcim_payment_link) {
      navigator.clipboard?.writeText(selected.helcim_payment_link).catch(() => {});
    }
  }

  /* ── Render ── */
  return (
    <PortalLayout title="Invoices">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Invoices</h2>
          <p className="portalPageDesc">
            Link Helcim invoices and track payment status. No card data is stored here.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" onClick={openCreateModal}>
          <i className="fa-solid fa-plus"></i> Link Invoice
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginBottom:"16px" }}>
        <div className="portalToolbar" style={{ marginBottom:0 }}>
          <div className="portalSearchBar">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input className="portalSearchInput"
              placeholder="Search by invoice #, RO #, customer, or vehicle…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize:".82rem", color:"var(--p-text-3)" }}>
              {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
          <div className="portalFilterTabs" style={{ flexWrap:"wrap" }}>
            {STATUS_FILTERS.map((s) => (
              <button key={s} className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
                onClick={() => setStatusFilter(s)}>
                {s === "all" ? "All" : INV_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="portalFilterTabs" style={{ flexWrap:"wrap" }}>
            {PAY_FILTERS.map((s) => (
              <button key={s} className={`portalFilterTab${payFilter === s ? " active" : ""}`}
                onClick={() => setPayFilter(s)}>
                {s === "all" ? "All Pay" : PAY_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice table */}
      <div className="portalCard" style={{ padding:0, overflow:"hidden", marginBottom:"16px" }}>
        {loading ? (
          <div className="portalEmptyState"><p style={{ color:"var(--p-text-3)" }}>Loading invoices…</p></div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load invoices</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={loadList}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-receipt" style={{ opacity:.25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search || statusFilter !== "all" || payFilter !== "all"
                ? "No invoices match your filters" : "No invoices yet"}
            </p>
            <p className="portalEmptyDesc">
              {search || statusFilter !== "all" || payFilter !== "all"
                ? "Try clearing filters." : "Link a Helcim invoice to a repair order to get started."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table className="portalTable">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>RO #</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th style={{ textAlign:"right" }}>Total</th>
                  <th style={{ textAlign:"right" }}>Paid</th>
                  <th style={{ textAlign:"right" }}>Due</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const ro = inv.repair_orders;
                  return (
                    <tr key={inv.id} onClick={() => openDetailById(inv.id)}
                      style={{ cursor:"pointer", background: selected?.id === inv.id ? "rgba(11,27,58,.04)" : undefined }}>
                      <td style={{ fontFamily:"monospace", fontWeight:700, color:"var(--p-navy)", fontSize:".88rem" }}>
                        {inv.helcim_invoice_number || <span style={{ color:"var(--p-text-3)", fontFamily:"inherit" }}>—</span>}
                      </td>
                      <td style={{ fontFamily:"monospace", fontSize:".83rem", color:"var(--p-text-2)" }}>
                        {ro?.ro_number ?? "—"}
                      </td>
                      <td style={{ fontWeight:600 }}>
                        {ro?.customers ? `${ro.customers.first_name} ${ro.customers.last_name}` : "—"}
                      </td>
                      <td style={{ fontSize:".85rem", color:"var(--p-text-2)" }}>
                        {ro?.vehicles ? vehicleLabel(ro.vehicles) : "—"}
                      </td>
                      <td><span className={`portalBadge ${statusClass(inv.status)}`}>{INV_STATUS_LABELS[inv.status] ?? inv.status}</span></td>
                      <td><span className={`portalBadge ${payClass(inv.payment_status)}`}>{PAY_STATUS_LABELS[inv.payment_status] ?? inv.payment_status}</span></td>
                      <td style={{ textAlign:"right", fontFamily:"monospace", fontWeight:600, fontSize:".88rem" }}>{fmtCents(inv.total_cents)}</td>
                      <td style={{ textAlign:"right", fontFamily:"monospace", fontSize:".83rem", color:"var(--p-success)" }}>{fmtCents(inv.amount_paid_cents)}</td>
                      <td style={{ textAlign:"right", fontFamily:"monospace", fontSize:".83rem", color: inv.payment_status === "paid" ? "var(--p-text-3)" : "var(--p-danger)" }}>{fmtCents(inv.amount_due_cents)}</td>
                      <td style={{ fontSize:".83rem", color:"var(--p-text-3)", whiteSpace:"nowrap" }}>{fmtDate(inv.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {(selected || detailLoading) && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="portalModalCard portalModalLg" role="dialog" aria-modal="true" aria-label="Invoice Detail">
            <div className="portalModalHeader">
              <div>
                {selected ? (
                  <>
                    <h2 className="portalModalTitle" style={{ fontFamily:"monospace", letterSpacing:".5px" }}>
                      {selected.helcim_invoice_number || "(No invoice number yet)"}
                      {selected.ro?.ro_number && (
                        <span style={{ fontFamily:"inherit", fontWeight:400, fontSize:".75rem", color:"var(--p-text-2)", marginLeft:10 }}>
                          RO: {selected.ro.ro_number}
                        </span>
                      )}
                    </h2>
                    <div className="portalROBadges" style={{ marginTop:4 }}>
                      <span className={`portalBadge ${statusClass(selected.status)}`}>{INV_STATUS_LABELS[selected.status] ?? selected.status}</span>
                      <span className={`portalBadge ${payClass(selected.payment_status)}`}>{PAY_STATUS_LABELS[selected.payment_status] ?? selected.payment_status}</span>
                    </div>
                  </>
                ) : (
                  <h2 className="portalModalTitle">Invoice</h2>
                )}
              </div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
                {selected && (
                  <button className="portalBtn portalBtnSecondary" onClick={openEditModal}>
                    <i className="fa-solid fa-pen"></i> Edit
                  </button>
                )}
                {selected && (
                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                    <button className="portalBtn portalBtnSecondary" onClick={() => window.print()}>
                      <i className="fa-solid fa-print"></i> Print
                    </button>
                    <span
                      className="invPrintHint"
                      title="For a clean PDF, turn off browser Headers and footers in the print dialog."
                    >
                      <i className="fa-solid fa-circle-info"></i>
                    </span>
                  </div>
                )}
                <button className="portalModalClose" onClick={() => setSelected(null)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
            <div className="portalModalBody">
          {detailLoading ? (
            <p style={{ color:"var(--p-text-3)", fontSize:".88rem" }}>Loading invoice…</p>
          ) : selected ? (
            <>
              {/* Totals */}
              <div className="portalInvTotals">
                <div className="portalInvTotalCell">
                  <div className="label">Subtotal</div>
                  <div className="value">{fmtCents(selected.subtotal_cents)}</div>
                </div>
                <div className="portalInvTotalCell">
                  <div className="label">Tax (GST)</div>
                  <div className="value">{fmtCents(selected.tax_cents)}</div>
                </div>
                <div className="portalInvTotalCell highlight">
                  <div className="label">Total</div>
                  <div className="value">{fmtCents(selected.total_cents)}</div>
                </div>
                <div className="portalInvTotalCell">
                  <div className="label">Amount Paid</div>
                  <div className="value" style={{ color:"var(--p-success)" }}>{fmtCents(selected.amount_paid_cents)}</div>
                </div>
                <div className="portalInvTotalCell">
                  <div className="label">Amount Due</div>
                  <div className="value" style={{ color: selected.payment_status === "paid" ? "var(--p-text-3)" : "var(--p-danger)" }}>
                    {fmtCents(selected.amount_due_cents)}
                  </div>
                </div>
              </div>

              {/* Helcim reference fields */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:"12px 20px", marginBottom:"16px" }}>
                <DField label="Helcim Invoice ID"     value={selected.helcim_invoice_id} mono />
                <DField label="Helcim Invoice Number" value={selected.helcim_invoice_number} mono />
                <DField label="Helcim Customer ID"    value={selected.helcim_customer_id} mono />
                <DField label="Issued"   value={fmtDate(selected.issued_at)} />
                <DField label="Due"      value={fmtDate(selected.due_at)} />
                <DField label="Paid"     value={fmtDate(selected.paid_at)} />
                <DField label="Customer" value={fullName(selected.customer)} />
                <DField label="Vehicle"  value={vehicleLabel(selected.vehicle)} />
                {selected.estimate && (
                  <DField label="Linked Estimate" value={selected.estimate.estimate_number} mono />
                )}
              </div>

              {/* Payment link */}
              {selected.helcim_payment_link && (
                <div style={{ marginBottom:"16px" }}>
                  <div className="portalDetailLabel" style={{ marginBottom:4 }}>Helcim Payment Link</div>
                  <div className="portalPayLink">
                    <span className="portalPayLinkUrl">{selected.helcim_payment_link}</span>
                    <div className="portalPayLinkActions">
                      <button className="portalBtnIcon" onClick={copyLink} title="Copy link">
                        <i className="fa-solid fa-copy"></i>
                      </button>
                      <a href={selected.helcim_payment_link} target="_blank" rel="noopener noreferrer">
                        <button className="portalBtnIcon" title="Open in new tab">
                          <i className="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selected.notes && (
                <div style={{ marginBottom:"16px" }}>
                  <div className="portalDetailLabel">Notes</div>
                  <div className="portalDetailValue" style={{ marginTop:4, whiteSpace:"pre-wrap" }}>{selected.notes}</div>
                </div>
              )}

              {/* Line item snapshots */}
              {selected.items?.length > 0 && (
                <div style={{ marginBottom:"16px" }}>
                  <div className="portalDetailLabel" style={{ marginBottom:8 }}>Invoice Line Items (Snapshot)</div>
                  <div style={{ overflowX:"auto" }}>
                    <table className="portalEstItemTable">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th className="money">Qty</th>
                          <th className="money">Unit Price</th>
                          <th className="money">Total</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.description}</td>
                            <td className="money" style={{ color:"var(--p-text-2)" }}>{item.quantity}</td>
                            <td className="money" style={{ color:"var(--p-text-2)" }}>{fmtCents(item.unit_price_cents)}</td>
                            <td className="money" style={{ fontWeight:600 }}>{fmtCents(item.line_total_cents)}</td>
                            <td style={{ fontSize:".78rem", color:"var(--p-text-2)" }}>{item.item_type ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment actions */}
              <div className="portalPayActions">
                <span style={{ fontSize:".75rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".8px", color:"var(--p-text-3)", alignSelf:"center" }}>
                  Payment:
                </span>
                {["unpaid","partial","paid"].map((p) => (
                  <button key={p}
                    className={`portalPayActionBtn${selected.payment_status === p ? " active" : ""}${p === "paid" ? " success" : ""}`}
                    onClick={() => {
                      if (p === "partial") { setPartialModal(true); }
                      else handlePaymentStatus(p);
                    }}
                    disabled={changingPay || selected.payment_status === p}>
                    {PAY_STATUS_LABELS[p]}
                  </button>
                ))}
                <span style={{ marginLeft:"auto", display:"flex", gap:"6px" }}>
                  <button className="portalPayActionBtn danger"
                    onClick={() => handlePaymentStatus("voided")}
                    disabled={changingPay || selected.payment_status === "voided"}>
                    Void
                  </button>
                  {/* Status actions */}
                  {["created","sent","archived"].map((s) => (
                    <button key={s}
                      className={`portalPayActionBtn${selected.status === s ? " active" : ""}`}
                      onClick={() => handleStatusChange(s)}
                      disabled={changingStatus || selected.status === s}>
                      {INV_STATUS_LABELS[s]}
                    </button>
                  ))}
                </span>
              </div>

              {/* Helcim API creation */}
              <div style={{ marginTop:"10px", paddingTop:"10px", borderTop:"1px solid var(--p-border)", display:"flex", flexDirection:"column", gap:"8px" }}>
                <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
                  {selected.helcim_invoice_id ? (
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <i className="fa-solid fa-circle-check" style={{ color:"var(--p-success)" }}></i>
                      <span style={{ fontSize:".83rem", color:"var(--p-text-2)" }}>
                        Linked to Helcim
                        {selected.helcim_invoice_number && ` — ${selected.helcim_invoice_number}`}
                      </span>
                      {selected.last_synced_at && (
                        <span style={{ fontSize:".72rem", color:"var(--p-text-3)" }}>
                          · Last synced {fmtDate(selected.last_synced_at)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button className="portalBtn portalBtnPrimary"
                      onClick={handleHelcimCreate}
                      disabled={helcimCreating || !canCreateInHelcim}
                      title={
                        !selected.repair_order_id ? "Invoice must have a linked repair order" :
                        (selected.total_cents ?? 0) === 0 ? "Invoice total must be greater than $0" :
                        !canCreateInHelcim ? "Invoice cannot be created in Helcim in its current state" :
                        "Create this invoice in Helcim using the API"
                      }>
                      <i className={`fa-solid ${helcimCreating ? "fa-spinner fa-spin" : "fa-cloud-arrow-up"}`}></i>
                      {helcimCreating ? " Creating in Helcim…" : " Create in Helcim"}
                    </button>
                  )}
                  <button className="portalBtn portalBtnSecondary" disabled
                    title="Webhook payment sync — coming in Phase 9D">
                    <i className="fa-solid fa-arrows-rotate"></i> Sync
                    <span style={{ fontSize:".7rem", marginLeft:5, opacity:.5 }}>Phase 9D</span>
                  </button>
                </div>
                {helcimSuccess && (
                  <div style={{ padding:"8px 12px", background:"var(--p-success-bg)", border:"1px solid #a3d9c2", borderRadius:"6px", fontSize:".82rem", color:"var(--p-success)" }}>
                    <i className="fa-solid fa-circle-check" style={{ marginRight:6 }}></i>{helcimSuccess}
                  </div>
                )}
                {helcimError && (
                  <div style={{ padding:"8px 12px", background:"var(--p-danger-bg)", border:"1px solid #f4c0bc", borderRadius:"6px", fontSize:".82rem", color:"var(--p-danger)" }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight:6 }}></i>{helcimError}
                  </div>
                )}
                {selected.sync_error && !helcimError && (
                  <div style={{ padding:"8px 12px", background:"var(--p-warning-bg)", border:"1px solid #f0d080", borderRadius:"6px", fontSize:".78rem", color:"var(--p-warning)" }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight:6 }}></i>
                    Last sync error: {selected.sync_error}
                  </div>
                )}
              </div>
            </>
          ) : null}
            </div>{/* portalModalBody */}
          </div>{/* portalModalCard */}
        </div>
      )}

      {/* Partial payment modal */}
      {partialModal && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setPartialModal(false)}>
          <div className="portalModalCard" style={{ maxWidth:"380px" }}>
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Mark Partial Payment</h2>
              <button className="portalModalClose" onClick={() => setPartialModal(false)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="portalModalBody">
              <div className="portalFormField">
                <label className="portalFormLabel">Amount Paid ($)</label>
                <input className="portalFormInput" type="number" min="0" step="0.01"
                  value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="e.g. 150.00" />
              </div>
              <p style={{ fontSize:".78rem", color:"var(--p-text-3)", margin:"6px 0 0" }}>
                Total: {fmtCents(selected?.total_cents)}
              </p>
            </div>
            <div className="portalModalFooter">
              <button className="portalBtn portalBtnSecondary" onClick={() => setPartialModal(false)} disabled={changingPay}>Cancel</button>
              <button className="portalBtn portalBtnPrimary" disabled={changingPay || !partialAmount}
                onClick={() => handlePaymentStatus("partial", { amount_paid_cents: dollarsToCents(partialAmount) })}>
                {changingPay ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createModal && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setCreateModal(false)}>
          <div className="portalModalCard" style={{ maxWidth:"560px" }} role="dialog" aria-modal="true">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Link Invoice to Repair Order</h2>
              <button className="portalModalClose" onClick={() => setCreateModal(false)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleCreate} noValidate>
              <div className="portalModalBody">
                {saveError && <div className="portalModalError">{saveError}</div>}
                <div className="portalForm">
                  <div className="portalFormField">
                    <label className="portalFormLabel">Repair Order<span className="req">*</span></label>
                    <select className={`portalFormSelect${formErrors.repair_order_id ? " invalid" : ""}`}
                      name="repair_order_id" value={formData.repair_order_id} onChange={handleFormField}>
                      <option value="">— Select repair order —</option>
                      {allRos.map((ro) => (
                        <option key={ro.id} value={ro.id}>
                          {ro.ro_number} — {ro.customers ? `${ro.customers.first_name} ${ro.customers.last_name}` : ""}
                        </option>
                      ))}
                    </select>
                    {formErrors.repair_order_id && <p className="portalFormFieldError">{formErrors.repair_order_id}</p>}
                  </div>

                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel">Helcim Invoice ID</label>
                      <input className="portalFormInput" name="helcim_invoice_id" style={{ fontFamily:"monospace" }}
                        value={formData.helcim_invoice_id} onChange={handleFormField} placeholder="Paste from Helcim" />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Helcim Invoice Number</label>
                      <input className="portalFormInput" name="helcim_invoice_number" style={{ fontFamily:"monospace" }}
                        value={formData.helcim_invoice_number} onChange={handleFormField} placeholder="e.g. INV-0042" />
                    </div>
                  </div>

                  <div className="portalFormField">
                    <label className="portalFormLabel">Helcim Payment Link</label>
                    <input className="portalFormInput" name="helcim_payment_link" type="url"
                      value={formData.helcim_payment_link} onChange={handleFormField} placeholder="https://myaccount.helcim.com/pay/..." />
                  </div>

                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel">Total ($)</label>
                      <input className="portalFormInput" name="total_cents" type="number" min="0" step="0.01"
                        value={formData.total_cents} onChange={handleFormField} placeholder="0.00" />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Issued Date</label>
                      <input className="portalFormInput" name="issued_at" type="date"
                        value={formData.issued_at} onChange={handleFormField} />
                    </div>
                  </div>

                  <div className="portalFormField">
                    <label className="portalFormLabel">Notes</label>
                    <textarea className="portalFormTextarea" name="notes" rows={2}
                      value={formData.notes} onChange={handleFormField} placeholder="Optional notes…" />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary" onClick={() => setCreateModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={saving}>
                  {saving ? "Saving…" : "Save Invoice Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="portalModalOverlay" onClick={(e) => e.target === e.currentTarget && setEditModal(false)}>
          <div className="portalModalCard" style={{ maxWidth:"520px" }} role="dialog" aria-modal="true">
            <div className="portalModalHeader">
              <h2 className="portalModalTitle">Edit Invoice Details</h2>
              <button className="portalModalClose" onClick={() => setEditModal(false)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleEdit} noValidate>
              <div className="portalModalBody">
                {editError && <div className="portalModalError">{editError}</div>}
                <div className="portalForm">
                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel">Helcim Invoice ID</label>
                      <input className="portalFormInput" name="helcim_invoice_id" style={{ fontFamily:"monospace" }}
                        value={editForm.helcim_invoice_id} onChange={handleEditField} />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Helcim Invoice Number</label>
                      <input className="portalFormInput" name="helcim_invoice_number" style={{ fontFamily:"monospace" }}
                        value={editForm.helcim_invoice_number} onChange={handleEditField} />
                    </div>
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Helcim Customer ID</label>
                    <input className="portalFormInput" name="helcim_customer_id" style={{ fontFamily:"monospace" }}
                      value={editForm.helcim_customer_id} onChange={handleEditField} />
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Helcim Payment Link</label>
                    <input className="portalFormInput" name="helcim_payment_link" type="url"
                      value={editForm.helcim_payment_link} onChange={handleEditField} />
                  </div>
                  <div className="portalFormRow">
                    <div className="portalFormField">
                      <label className="portalFormLabel">Issued Date</label>
                      <input className="portalFormInput" name="issued_at" type="date" value={editForm.issued_at} onChange={handleEditField} />
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Due Date</label>
                      <input className="portalFormInput" name="due_at" type="date" value={editForm.due_at} onChange={handleEditField} />
                    </div>
                  </div>
                  <div className="portalFormField">
                    <label className="portalFormLabel">Notes</label>
                    <textarea className="portalFormTextarea" name="notes" rows={2}
                      value={editForm.notes} onChange={handleEditField} />
                  </div>
                </div>
              </div>
              <div className="portalModalFooter">
                <button type="button" className="portalBtn portalBtnSecondary" onClick={() => setEditModal(false)} disabled={editSaving}>Cancel</button>
                <button type="submit" className="portalBtn portalBtnPrimary" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Print-only invoice — hidden on screen, revealed by @media print */}
      {selected && <InvoicePrintView invoice={selected} />}
    </PortalLayout>
  );
}
