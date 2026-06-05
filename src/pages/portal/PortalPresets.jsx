import { useState, useEffect } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listAllCannedJobs, getCannedJob,
  createCannedJob, updateCannedJob, softHideCannedJob,
  createCannedJobItem, updateCannedJobItem,
} from "../../lib/portalData";

/* ── Constants ── */
const ITEM_TYPE_LABELS = {
  labor:       "Labour",
  part:        "Part",
  shop_supply: "Shop Supply",
  fee:         "Fee",
  discount:    "Discount",
  other:       "Other",
};

const EMPTY_ITEM_FORM = {
  item_type:             "labor",
  description:           "",
  quantity:              "1",
  cost_dollars:          "",
  markup_type:           "percent",
  markup_percent:        "",
  markup_value_dollars:  "",
  unit_price_dollars:    "0.00",
  is_required:           false,
  is_customer_visible:   true,
  notes:                 "",
  sort_order:            "0",
};

/* ── Helpers ── */
function fmtCents(cents) {
  if (cents == null) return "$0.00";
  const val = (cents / 100).toFixed(2);
  return cents < 0 ? `-$${Math.abs(parseFloat(val)).toFixed(2)}` : `$${val}`;
}

function typeClass(t) { return t?.replace(/_/g, "-") ?? "other"; }

function TypeBadge({ type }) {
  return (
    <span className={`portalTypeBadge ${typeClass(type)}`}>
      {ITEM_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function validateItemForm(d) {
  const e = {};
  if (!d.description?.trim()) e.description = "Description is required.";
  if (parseFloat(d.quantity) < 0) e.quantity = "Quantity must be 0 or greater.";
  if (parseFloat(d.unit_price_dollars) < 0) e.unit_price_dollars = "Price must be 0 or greater.";
  if (d.cost_dollars !== "" && parseFloat(d.cost_dollars) < 0) e.cost_dollars = "Cost must be 0 or greater.";
  if (d.markup_type !== "fixed" && d.markup_percent !== "" && parseFloat(d.markup_percent) < 0)
    e.markup_percent = "Markup must be 0 or greater.";
  if (d.markup_type === "fixed" && d.markup_value_dollars !== "" && parseFloat(d.markup_value_dollars) < 0)
    e.markup_value_dollars = "Markup must be 0 or greater.";
  return e;
}

/* ── Item form (shared between add and edit) ── */
function ItemForm({ form, errors, onChange, onSubmit, onCancel, saving, isEdit }) {
  return (
    <form onSubmit={onSubmit} noValidate className="portalCannedItemEditRow">
      <div className="portalForm" style={{ maxWidth: "100%" }}>
        <div className="portalFormRow">
          <div className="portalFormField" style={{ flex: "0 0 110px" }}>
            <label className="portalFormLabel">Type</label>
            <select className="portalFormSelect" name="item_type" value={form.item_type} onChange={onChange}>
              {Object.entries(ITEM_TYPE_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
          <div className="portalFormField" style={{ flex: 3 }}>
            <label className="portalFormLabel">Description<span className="req">*</span></label>
            <input className={`portalFormInput${errors.description ? " invalid" : ""}`}
              name="description" value={form.description} onChange={onChange}
              placeholder="e.g. Replace front brake pads — labour" autoFocus={!isEdit} />
            {errors.description && <p className="portalFormFieldError">{errors.description}</p>}
          </div>
          <div className="portalFormField" style={{ flex: "0 0 70px" }}>
            <label className="portalFormLabel">Qty</label>
            <input className="portalFormInput" name="quantity" type="number" min="0" step="0.5"
              value={form.quantity} onChange={onChange} />
          </div>
        </div>
        <div className="portalItemPricingSection">
          <p className="portalItemPricingLabel">
            <i className="fa-solid fa-lock" style={{ fontSize: ".65rem", marginRight: 5, opacity: .7 }}></i>Staff-Only Pricing
          </p>
          <div className="portalFormRow">
            <div className="portalFormField">
              <label className="portalFormLabel">Cost ($)</label>
              <input className="portalFormInput" name="cost_dollars" type="number" min="0" step="0.01"
                value={form.cost_dollars} onChange={onChange} placeholder="0.00" />
            </div>
            <div className="portalFormField" style={{ flex: "0 0 100px" }}>
              <label className="portalFormLabel">Type</label>
              <select className="portalFormSelect" name="markup_type" value={form.markup_type} onChange={onChange}>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed $</option>
              </select>
            </div>
            <div className="portalFormField">
              <label className="portalFormLabel">{form.markup_type === "fixed" ? "Markup ($)" : "Markup (%)"}</label>
              {form.markup_type === "fixed" ? (
                <input className={`portalFormInput${errors.markup_value_dollars ? " invalid" : ""}`}
                  name="markup_value_dollars" type="number" min="0" step="0.01"
                  value={form.markup_value_dollars} onChange={onChange} placeholder="0.00" />
              ) : (
                <input className={`portalFormInput${errors.markup_percent ? " invalid" : ""}`}
                  name="markup_percent" type="number" min="0" step="0.1"
                  value={form.markup_percent} onChange={onChange} placeholder="0" />
              )}
              {form.markup_type === "fixed"  && errors.markup_value_dollars && <p className="portalFormFieldError">{errors.markup_value_dollars}</p>}
              {form.markup_type !== "fixed"  && errors.markup_percent        && <p className="portalFormFieldError">{errors.markup_percent}</p>}
            </div>
            <div className="portalFormField">
              <label className="portalFormLabel">Customer Price ($)</label>
              <input className={`portalFormInput${errors.unit_price_dollars ? " invalid" : ""}`}
                name="unit_price_dollars" type="number" min="0" step="0.01"
                value={form.unit_price_dollars} onChange={onChange} />
              {errors.unit_price_dollars && <p className="portalFormFieldError">{errors.unit_price_dollars}</p>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="submit" className="portalBtn portalBtnPrimary" style={{ padding: "6px 14px", fontSize: ".8rem" }}
            disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className="portalBtn portalBtnSecondary" style={{ padding: "6px 14px", fontSize: ".8rem" }}
            onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}

/* ── Main page ── */
export default function PortalPresets() {
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [allJobs,     setAllJobs]     = useState([]);

  /* selected job panel */
  const [sel,         setSel]         = useState(null);   // full job with items[], null = new
  const [selLoading,  setSelLoading]  = useState(false);
  const [jobForm,     setJobForm]     = useState({ name: "", description: "", category: "", sort_order: "0" });
  const [jobErrors,   setJobErrors]   = useState({});
  const [savingJob,   setSavingJob]   = useState(false);

  /* item forms */
  const [addItemMode, setAddItemMode] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm,    setItemForm]    = useState({ ...EMPTY_ITEM_FORM });
  const [itemErrors,  setItemErrors]  = useState({});
  const [savingItem,  setSavingItem]  = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      setAllJobs(await listAllCannedJobs());
    } catch { setError("Failed to load presets."); }
    finally { setLoading(false); }
  }

  async function selectJob(job) {
    setSel(null); setAddItemMode(false); setEditingItem(null);
    setJobForm({
      name:        job.name        ?? "",
      description: job.description ?? "",
      category:    job.category    ?? "",
      sort_order:  String(job.sort_order ?? 0),
    });
    setJobErrors({}); setError("");
    setSelLoading(true);
    try { setSel(await getCannedJob(job.id)); }
    catch { setError("Failed to load preset details."); }
    finally { setSelLoading(false); }
  }

  function selectNew() {
    setSel(null); setAddItemMode(false); setEditingItem(null);
    setJobForm({ name: "", description: "", category: "", sort_order: "0" });
    setJobErrors({}); setError("");
  }

  async function handleSaveJob(e) {
    e.preventDefault();
    const errs = {};
    if (!jobForm.name?.trim()) errs.name = "Name is required.";
    if (Object.keys(errs).length) { setJobErrors(errs); return; }
    setSavingJob(true); setError("");
    try {
      const payload = {
        name:        jobForm.name.trim(),
        description: jobForm.description || null,
        category:    jobForm.category    || null,
        sort_order:  parseInt(jobForm.sort_order ?? 0) || 0,
      };
      if (sel?.id) {
        const updated = await updateCannedJob(sel.id, payload);
        setSel((p) => ({ ...p, ...updated }));
        setAllJobs((p) => p.map((j) => j.id === updated.id ? { ...j, ...updated } : j));
      } else {
        const created = await createCannedJob(payload);
        setAllJobs((p) => [...p, created]);
        const full = await getCannedJob(created.id);
        setSel(full);
        setJobForm({
          name:        full.name        ?? "",
          description: full.description ?? "",
          category:    full.category    ?? "",
          sort_order:  String(full.sort_order ?? 0),
        });
      }
    } catch { setError("Failed to save preset. Please try again."); }
    finally { setSavingJob(false); }
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate "${sel.name}"? It will no longer appear in the preset picker.`)) return;
    try {
      await softHideCannedJob(sel.id);
      setAllJobs((p) => p.map((j) => j.id === sel.id ? { ...j, is_active: false } : j));
      setSel((p) => ({ ...p, is_active: false }));
    } catch { setError("Failed to deactivate. Please try again."); }
  }

  async function handleReactivate() {
    try {
      const updated = await updateCannedJob(sel.id, { is_active: true });
      setAllJobs((p) => p.map((j) => j.id === updated.id ? { ...j, is_active: true } : j));
      setSel((p) => ({ ...p, is_active: true }));
    } catch { setError("Failed to reactivate. Please try again."); }
  }

  /* ── Item helpers ── */
  function openEditItem(item) {
    setEditingItem(item); setAddItemMode(false);
    setItemForm({
      item_type:             item.item_type,
      description:           item.description,
      quantity:              String(item.quantity),
      cost_dollars:          item.cost_cents != null ? (item.cost_cents / 100).toFixed(2) : "",
      markup_type:           item.markup_type ?? "percent",
      markup_percent:        item.markup_percent != null ? String(item.markup_percent) : "",
      markup_value_dollars:  item.markup_value_cents != null ? (item.markup_value_cents / 100).toFixed(2) : "",
      unit_price_dollars:    ((item.unit_price_cents ?? 0) / 100).toFixed(2),
      is_required:           item.is_required        ?? false,
      is_customer_visible:   item.is_customer_visible ?? true,
      notes:                 item.notes ?? "",
      sort_order:            String(item.sort_order ?? 0),
    });
    setItemErrors({});
  }

  function openAddItem() {
    setAddItemMode(true); setEditingItem(null);
    setItemForm({ ...EMPTY_ITEM_FORM }); setItemErrors({});
  }

  function cancelItem() {
    setEditingItem(null); setAddItemMode(false);
    setItemForm({ ...EMPTY_ITEM_FORM }); setItemErrors({});
  }

  function handleItemField(e) {
    const { name, value, type, checked } = e.target;
    const newVal = type === "checkbox" ? checked : value;
    setItemForm((p) => {
      const updated = { ...p, [name]: newVal };
      const cost   = parseFloat(name === "cost_dollars"         ? newVal : updated.cost_dollars);
      const pct    = parseFloat(name === "markup_percent"       ? newVal : updated.markup_percent);
      const fixed  = parseFloat(name === "markup_value_dollars" ? newVal : updated.markup_value_dollars);
      const mtype  = name === "markup_type" ? newVal : updated.markup_type;
      if (!isNaN(cost) && cost >= 0) {
        if (mtype === "fixed" && !isNaN(fixed) && fixed >= 0) {
          updated.unit_price_dollars = (cost + fixed).toFixed(2);
        } else if (mtype !== "fixed" && !isNaN(pct) && pct >= 0) {
          updated.unit_price_dollars = (cost * (1 + pct / 100)).toFixed(2);
        }
      }
      return updated;
    });
    if (itemErrors[name]) setItemErrors((p) => ({ ...p, [name]: "" }));
  }

  async function handleSaveItem(e) {
    e.preventDefault();
    const errs = validateItemForm(itemForm);
    if (Object.keys(errs).length) { setItemErrors(errs); return; }
    setSavingItem(true); setError("");
    try {
      if (editingItem) {
        const updated = await updateCannedJobItem(editingItem.id, itemForm);
        setSel((p) => ({ ...p, items: p.items.map((i) => i.id === updated.id ? updated : i) }));
        setEditingItem(null);
      } else {
        const created = await createCannedJobItem(sel.id, itemForm);
        setSel((p) => ({ ...p, items: [...(p.items ?? []), created] }));
        setAddItemMode(false);
      }
      setItemForm({ ...EMPTY_ITEM_FORM }); setItemErrors({});
    } catch { setError("Failed to save item. Please try again."); }
    finally { setSavingItem(false); }
  }

  const isNew = !sel;

  return (
    <PortalLayout title="Presets">
      {error && (
        <div className="portalModalError" style={{ margin: "0 0 16px", borderRadius: "var(--p-radius-sm)" }}>
          {error}
        </div>
      )}

      <div className="portalCannedLayout" style={{ height: "calc(100vh - 152px)", minHeight: "480px" }}>

        {/* ── Left: job list ── */}
        <div className="portalCannedSidebar">
          <p className="portalCannedSidebarLabel">Preset Jobs</p>

          {loading ? (
            <p style={{ padding: "12px", fontSize: ".82rem", color: "var(--p-text-3)" }}>Loading…</p>
          ) : allJobs.length === 0 ? (
            <p style={{ padding: "12px", fontSize: ".82rem", color: "var(--p-text-3)", fontStyle: "italic" }}>
              No presets yet. Create one using the button below.
            </p>
          ) : allJobs.map((job) => (
            <button key={job.id}
              className={`portalCannedJobBtn${sel?.id === job.id ? " selected" : ""}${!job.is_active ? " inactive" : ""}`}
              onClick={() => selectJob(job)}>
              <span className="portalCannedJobName">{job.name}</span>
              {!job.is_active && <span className="portalCannedJobCat" style={{ color: "var(--p-text-3)" }}>Inactive</span>}
              {job.is_active && job.category && <span className="portalCannedJobCat">{job.category}</span>}
            </button>
          ))}

          <button
            className={`portalCannedJobBtn${isNew && !selLoading ? " selected" : ""}`}
            onClick={selectNew}
            style={{ borderTop: "1px dashed var(--p-border)", marginTop: 4, paddingTop: 8, color: "var(--p-success)" }}>
            <i className="fa-solid fa-plus" style={{ marginRight: 6 }}></i> New Preset
          </button>
        </div>

        {/* ── Right: editor panel ── */}
        <div className="portalCannedPreview">
          {selLoading ? (
            <p style={{ padding: "20px", fontSize: ".82rem", color: "var(--p-text-3)" }}>Loading…</p>
          ) : (
            <>
              {/* Job form */}
              <form onSubmit={handleSaveJob} noValidate>
                <div className="portalCannedManageSection">
                  <p className="portalCannedPreviewTitle">{sel ? "Edit Preset" : "New Preset Job"}</p>
                  <div className="portalForm" style={{ maxWidth: "100%" }}>
                    <div className="portalFormRow">
                      <div className="portalFormField" style={{ flex: 2 }}>
                        <label className="portalFormLabel">Name<span className="req">*</span></label>
                        <input className={`portalFormInput${jobErrors.name ? " invalid" : ""}`}
                          value={jobForm.name}
                          onChange={(e) => setJobForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Brake Service" />
                        {jobErrors.name && <p className="portalFormFieldError">{jobErrors.name}</p>}
                      </div>
                      <div className="portalFormField" style={{ flex: 1 }}>
                        <label className="portalFormLabel">Category</label>
                        <input className="portalFormInput"
                          value={jobForm.category}
                          onChange={(e) => setJobForm((p) => ({ ...p, category: e.target.value }))}
                          placeholder="e.g. Brakes" />
                      </div>
                      <div className="portalFormField" style={{ flex: "0 0 80px" }}>
                        <label className="portalFormLabel">Order</label>
                        <input className="portalFormInput" type="number" min="0"
                          value={jobForm.sort_order}
                          onChange={(e) => setJobForm((p) => ({ ...p, sort_order: e.target.value }))} />
                      </div>
                    </div>
                    <div className="portalFormField">
                      <label className="portalFormLabel">Description (optional)</label>
                      <textarea className="portalFormTextarea" rows={2}
                        value={jobForm.description}
                        onChange={(e) => setJobForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Short description shown in the preset picker…" />
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button type="submit" className="portalBtn portalBtnPrimary"
                        style={{ padding: "7px 16px", fontSize: ".82rem" }}
                        disabled={savingJob}>
                        {savingJob ? "Saving…" : sel ? "Save Changes" : "Create Preset"}
                      </button>
                      {sel && (
                        sel.is_active ? (
                          <button type="button" className="portalBtn portalBtnSecondary"
                            style={{ padding: "7px 14px", fontSize: ".82rem", color: "var(--p-danger)" }}
                            onClick={handleDeactivate}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" className="portalBtn portalBtnSecondary"
                            style={{ padding: "7px 14px", fontSize: ".82rem", color: "var(--p-success)" }}
                            onClick={handleReactivate}>
                            Reactivate
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Items section — only when editing an existing preset */}
              {sel && (
                <div className="portalCannedManageSection" style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <p className="portalCannedPreviewTitle" style={{ margin: 0 }}>Line Items</p>
                    {!addItemMode && !editingItem && (
                      <button type="button" className="portalBtn portalBtnPrimary"
                        style={{ padding: "5px 12px", fontSize: ".78rem" }}
                        onClick={openAddItem}>
                        <i className="fa-solid fa-plus"></i> Add Item
                      </button>
                    )}
                  </div>

                  {(sel.items?.length ?? 0) === 0 && !addItemMode && (
                    <p style={{ fontSize: ".82rem", color: "var(--p-text-3)", fontStyle: "italic" }}>
                      No items yet. Add items using the button above.
                    </p>
                  )}

                  {(sel.items ?? []).map((item) =>
                    editingItem?.id === item.id ? (
                      <ItemForm key={item.id}
                        form={itemForm} errors={itemErrors}
                        onChange={handleItemField} onSubmit={handleSaveItem} onCancel={cancelItem}
                        saving={savingItem} isEdit />
                    ) : (
                      <div key={item.id} className="portalCannedItemRow">
                        <TypeBadge type={item.item_type} />
                        <span style={{ flex: 1, fontWeight: 600, fontSize: ".85rem" }}>{item.description}</span>
                        <span style={{ color: "var(--p-text-3)", fontSize: ".78rem" }}>×{item.quantity}</span>
                        <span style={{ fontFamily: "monospace", fontSize: ".85rem", color: "var(--p-navy)", fontWeight: 700 }}>
                          {fmtCents(item.unit_price_cents)}
                        </span>
                        {item.cost_cents != null && (
                          <span className="portalItemCostHint" style={{ margin: 0 }}>
                            Cost: {fmtCents(item.cost_cents)}
                            {item.markup_type === "fixed" && item.markup_value_cents != null
                              ? ` +${fmtCents(item.markup_value_cents)} fixed`
                              : item.markup_percent != null ? ` +${item.markup_percent}%`
                              : ""}
                          </span>
                        )}
                        <button className="portalBtnIcon" onClick={() => openEditItem(item)} title="Edit"
                          disabled={!!editingItem || addItemMode}>
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      </div>
                    )
                  )}

                  {addItemMode && (
                    <ItemForm
                      form={itemForm} errors={itemErrors}
                      onChange={handleItemField} onSubmit={handleSaveItem} onCancel={cancelItem}
                      saving={savingItem} isEdit={false} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
