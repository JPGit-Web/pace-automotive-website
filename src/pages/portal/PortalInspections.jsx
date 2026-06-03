import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import {
  listInspections, getInspection,
  updateInspection, updateInspectionStatus,
  updateInspectionItem,
  listInspectionPhotos, uploadInspectionPhoto, softHideInspectionPhoto,
  getSignedPhotoUrl, logActivity,
} from "../../lib/portalData";

/* ── Constants ─────────────────────────────────────────────── */
const STATUS_LABELS = {
  draft:            "Draft",
  in_progress:      "In Progress",
  completed:        "Completed",
  sent_to_customer: "Sent to Customer",
};
const CONDITION_LABELS = {
  not_checked:     "Not Checked",
  good:            "Good",
  fair:            "Fair",
  needs_attention: "Needs Attention",
  urgent:          "URGENT",
  not_applicable:  "N/A",
};
const STATUS_FILTERS = ["all","draft","in_progress","completed","sent_to_customer"];
const ALLOWED_TYPES  = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];

/* ── Helpers ────────────────────────────────────────────────── */
const condClass = (c) => c?.replace(/_/g, "-") ?? "not-checked";
const statusClass = (s) => {
  if (s === "in_progress") return "in-progress-insp";
  if (s === "sent_to_customer") return "sent-to-customer";
  return s ?? "draft";
};
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" });
}

/* ── Photo Thumbnail (lazy-loads signed URL) ── */
function PhotoThumb({ photo, onHide }) {
  const [url, setUrl] = useState(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSignedPhotoUrl(photo.storage_path, 600)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setLoadErr(true); });
    return () => { cancelled = true; };
  }, [photo.storage_path]);

  return (
    <div className="portalInspPhotoThumb" title={photo.caption || photo.file_name}>
      {url ? (
        <img src={url} alt={photo.caption || photo.file_name || "Photo"} />
      ) : loadErr ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:".65rem",color:"var(--p-text-3)" }}>
          Error
        </div>
      ) : (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:".65rem",color:"var(--p-text-3)" }}>
          …
        </div>
      )}
      <div className="overlay">
        {url && (
          <button onClick={() => window.open(url, "_blank")} title="Open full size">
            <i className="fa-solid fa-expand"></i>
          </button>
        )}
        <button onClick={() => onHide(photo.id)} title="Hide photo">
          <i className="fa-solid fa-eye-slash"></i>
        </button>
      </div>
    </div>
  );
}

/* ── Inspection Item Row ── */
function ItemRow({ item, photos, onConditionChange, onNotesBlur, onRecommBlur, onVisChange, onUpload, onHidePhoto, uploadingItemIds }) {
  const [localNotes, setLocalNotes] = useState(item.notes ?? "");
  const [localRecomm, setLocalRecomm] = useState(item.recommendation ?? "");
  const fileInputRef = useRef(null);

  // Sync local state if item changes externally
  useEffect(() => { setLocalNotes(item.notes ?? ""); }, [item.id, item.notes]);
  useEffect(() => { setLocalRecomm(item.recommendation ?? ""); }, [item.id, item.recommendation]);

  const isUploading = uploadingItemIds.has(item.id);
  const itemPhotos  = photos[item.id] ?? [];

  return (
    <div className="portalInspItemRow">
      {/* Top row: name, condition, visibility */}
      <div className="portalInspItemTop">
        <span className="portalInspItemName">{item.item_name}</span>
        <select
          className={`portalConditionSelect cond-${condClass(item.condition)}`}
          value={item.condition}
          onChange={(e) => onConditionChange(item.id, e.target.value)}
        >
          {Object.entries(CONDITION_LABELS).map(([v, lbl]) => (
            <option key={v} value={v}>{lbl}</option>
          ))}
        </select>
        <label className="portalVisToggle">
          <input type="checkbox" checked={item.is_customer_visible}
            onChange={(e) => onVisChange(item.id, e.target.checked)} />
          Customer visible
        </label>
      </div>

      {/* Notes + recommendation */}
      <div className="portalInspItemNotes">
        <div className="portalInspNoteField">
          <span className="portalInspNoteLabel">Tech Notes</span>
          <textarea className="portalInspNoteTextarea" rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => { if (localNotes !== item.notes) onNotesBlur(item.id, localNotes); }}
            placeholder="Observations…"
          />
        </div>
        <div className="portalInspNoteField">
          <span className="portalInspNoteLabel">Recommendation</span>
          <textarea className="portalInspNoteTextarea" rows={2}
            value={localRecomm}
            onChange={(e) => setLocalRecomm(e.target.value)}
            onBlur={() => { if (localRecomm !== item.recommendation) onRecommBlur(item.id, localRecomm); }}
            placeholder="Recommended action…"
          />
        </div>
      </div>

      {/* Photos */}
      <div className="portalInspPhotos">
        {itemPhotos.length > 0 && (
          <div className="portalInspPhotoGrid">
            {itemPhotos.map((p) => (
              <PhotoThumb key={p.id} photo={p} onHide={onHidePhoto} />
            ))}
          </div>
        )}
        <input
          type="file" accept={ALLOWED_TYPES.join(",")}
          ref={fileInputRef} style={{ display:"none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(item.id, f);
            e.target.value = "";
          }}
        />
        <button className="portalUploadBtn" disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}>
          <i className="fa-solid fa-camera"></i>
          {isUploading ? " Uploading…" : " Add Photo"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================ */
export default function PortalInspections() {
  const location = useLocation();

  /* ── List state ── */
  const [inspections,  setInspections]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  /* ── Editor state ── */
  const [view,            setView]            = useState("list"); // 'list' | 'editor'
  const [activeInsp,      setActiveInsp]      = useState(null);
  const [items,           setItems]           = useState([]);
  const [photos,          setPhotos]          = useState({});  // { itemId: [photo] }
  const [editorLoading,   setEditorLoading]   = useState(false);
  const [changingStatus,  setChangingStatus]  = useState(false);
  const [savingItemIds,   setSavingItemIds]   = useState(new Set());
  const [uploadingItemIds,setUploadingItemIds]= useState(new Set());
  const [uploadError,     setUploadError]     = useState("");
  const [savingNotes,     setSavingNotes]     = useState(false);
  const [localOverall,    setLocalOverall]    = useState("");
  const [localCustNotes,  setLocalCustNotes]  = useState("");

  /* ── Load list ── */
  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try { setInspections(await listInspections()); }
    catch { setError("Failed to load inspections. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  /* ── Auto-open from navigation state (from Start Inspection in RO page) ── */
  useEffect(() => {
    const id = location.state?.inspectionId;
    if (!id) return;
    openEditorById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.inspectionId]);

  /* ── Open editor by inspection ID ── */
  async function openEditorById(inspectionId) {
    setEditorLoading(true);
    setView("editor");
    setUploadError("");
    try {
      const insp = await getInspection(inspectionId);
      setActiveInsp(insp);
      setItems(insp.items || []);
      setLocalOverall(insp.overall_notes ?? "");
      setLocalCustNotes(insp.customer_visible_notes ?? "");
      // Load photos and group by item id
      const allPhotos = await listInspectionPhotos(inspectionId);
      const grouped = {};
      for (const p of allPhotos) {
        const key = p.inspection_item_id ?? "__general";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
      }
      setPhotos(grouped);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[PortalInspections] open editor:", err);
      setView("list");
    } finally {
      setEditorLoading(false);
    }
  }

  function backToList() {
    setView("list");
    setActiveInsp(null);
    setItems([]);
    setPhotos({});
    setUploadError("");
    loadList(); // refresh list to reflect status changes
  }

  /* ── Filter ── */
  const filtered = inspections.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    const ro = i.repair_orders;
    return (
      ro?.ro_number?.toLowerCase().includes(t) ||
      ro?.customers?.first_name?.toLowerCase().includes(t) ||
      ro?.customers?.last_name?.toLowerCase().includes(t) ||
      ro?.vehicles?.make?.toLowerCase().includes(t) ||
      ro?.vehicles?.model?.toLowerCase().includes(t) ||
      i.status?.includes(t)
    );
  });
  const counts = inspections.reduce((a, i) => { a[i.status] = (a[i.status]||0)+1; return a; }, {});

  /* ── Status change ── */
  async function handleStatusChange(newStatus) {
    if (!activeInsp || changingStatus) return;
    setChangingStatus(true);
    try {
      const updated = await updateInspectionStatus(activeInsp.id, newStatus);
      await logActivity("inspection.status_changed", "inspection", activeInsp.id, {
        ro_number: activeInsp.ro?.ro_number, from: activeInsp.status, to: newStatus,
      });
      setActiveInsp((p) => ({ ...p, ...updated }));
      setInspections((p) => p.map((i) => i.id === updated.id ? { ...i, status: updated.status } : i));
    } catch { alert("Failed to update status. Please try again."); }
    finally { setChangingStatus(false); }
  }

  /* ── Save overall notes (on blur) ── */
  async function saveOverallNotes() {
    if (!activeInsp) return;
    if (localOverall === activeInsp.overall_notes && localCustNotes === activeInsp.customer_visible_notes) return;
    setSavingNotes(true);
    try {
      await updateInspection(activeInsp.id, {
        overall_notes:          localOverall || null,
        customer_visible_notes: localCustNotes || null,
      });
      await logActivity("inspection.updated", "inspection", activeInsp.id, { field: "notes" });
      setActiveInsp((p) => ({ ...p, overall_notes: localOverall || null, customer_visible_notes: localCustNotes || null }));
    } catch { /* silent — user can retry */ }
    finally { setSavingNotes(false); }
  }

  /* ── Item: condition change (immediate save) ── */
  async function handleConditionChange(itemId, condition) {
    setItems((p) => p.map((i) => i.id === itemId ? { ...i, condition } : i));
    setSavingItemIds((s) => new Set(s).add(itemId));
    try {
      await updateInspectionItem(itemId, { condition });
      await logActivity("inspection.item_updated", "inspection_item", itemId, { condition });
    } catch { /* silent */ }
    finally {
      setSavingItemIds((s) => { const n = new Set(s); n.delete(itemId); return n; });
    }
  }

  /* ── Item: notes blur save ── */
  async function handleNotesBlur(itemId, notes) {
    setItems((p) => p.map((i) => i.id === itemId ? { ...i, notes: notes || null } : i));
    try { await updateInspectionItem(itemId, { notes: notes || null }); }
    catch { /* silent */ }
  }

  /* ── Item: recommendation blur save ── */
  async function handleRecommBlur(itemId, recommendation) {
    setItems((p) => p.map((i) => i.id === itemId ? { ...i, recommendation: recommendation || null } : i));
    try { await updateInspectionItem(itemId, { recommendation: recommendation || null }); }
    catch { /* silent */ }
  }

  /* ── Item: visibility toggle (immediate save) ── */
  async function handleVisChange(itemId, is_customer_visible) {
    setItems((p) => p.map((i) => i.id === itemId ? { ...i, is_customer_visible } : i));
    try { await updateInspectionItem(itemId, { is_customer_visible }); }
    catch { /* silent */ }
  }

  /* ── Photo upload ── */
  async function handleUpload(itemId, file) {
    if (!activeInsp) return;
    setUploadError("");
    setUploadingItemIds((s) => new Set(s).add(itemId));
    try {
      const photo = await uploadInspectionPhoto({
        inspectionId:     activeInsp.id,
        inspectionItemId: itemId === "__general" ? null : itemId,
        repairOrderId:    activeInsp.repair_order_id,
        file,
        caption:          null,
      });
      await logActivity("inspection.photo_uploaded", "inspection_photo", photo.id, {
        item_id: itemId, file_name: file.name,
      });
      setPhotos((p) => {
        const key = itemId;
        return { ...p, [key]: [...(p[key] ?? []), photo] };
      });
    } catch (err) {
      setUploadError(err.message || "Upload failed. Check file type and size.");
    } finally {
      setUploadingItemIds((s) => { const n = new Set(s); n.delete(itemId); return n; });
    }
  }

  /* ── Photo soft-hide ── */
  async function handleHidePhoto(photoId) {
    if (!window.confirm("Hide this photo? It will no longer appear in the inspection.")) return;
    try {
      await softHideInspectionPhoto(photoId);
      await logActivity("inspection.photo_hidden", "inspection_photo", photoId, {});
      setPhotos((p) => {
        const updated = {};
        for (const [key, arr] of Object.entries(p)) {
          updated[key] = arr.filter((ph) => ph.id !== photoId);
        }
        return updated;
      });
    } catch { alert("Failed to hide photo. Please try again."); }
  }

  /* ── Group items by category ── */
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  /* ── Render ── */
  if (view === "editor") {
    return (
      <PortalLayout title="Inspection">
        {editorLoading ? (
          <div className="portalEmptyState">
            <p style={{ color:"var(--p-text-3)" }}>Loading inspection…</p>
          </div>
        ) : activeInsp ? (
          <>
            {/* Back + header */}
            <button className="portalDetailBack" onClick={backToList}>
              <i className="fa-solid fa-arrow-left"></i> Back to Inspections
            </button>

            <div className="portalDetailHeader">
              <div>
                <p style={{ margin:"0 0 4px", fontFamily:"monospace", fontWeight:800, fontSize:"1.1rem", color:"var(--p-navy)" }}>
                  {activeInsp.ro?.ro_number ?? "—"}
                  {activeInsp.ro?.customers && (
                    <span style={{ fontFamily:"inherit", fontWeight:400, fontSize:".88rem", color:"var(--p-text-2)", marginLeft:12 }}>
                      {activeInsp.ro.customers.first_name} {activeInsp.ro.customers.last_name}
                    </span>
                  )}
                  {activeInsp.ro?.vehicles && (
                    <span style={{ fontFamily:"inherit", fontWeight:400, fontSize:".85rem", color:"var(--p-text-3)", marginLeft:8 }}>
                      — {[activeInsp.ro.vehicles.year, activeInsp.ro.vehicles.make, activeInsp.ro.vehicles.model].filter(Boolean).join(" ")}
                    </span>
                  )}
                </p>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <span className={`portalBadge ${statusClass(activeInsp.status)}`}>
                    {STATUS_LABELS[activeInsp.status] ?? activeInsp.status}
                  </span>
                  {activeInsp.completed_at && (
                    <span style={{ fontSize:".75rem", color:"var(--p-text-3)" }}>
                      Completed {fmtDate(activeInsp.completed_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Status actions */}
              <div className="portalApptStatusActions" style={{ marginLeft:"auto" }}>
                <span className="label">Status:</span>
                {[
                  { s:"draft",            lbl:"Draft" },
                  { s:"in_progress",      lbl:"In Progress" },
                  { s:"completed",        lbl:"Mark Completed" },
                  { s:"sent_to_customer", lbl:"Sent to Customer" },
                ].map(({ s, lbl }) => (
                  <button key={s}
                    className={`portalBtnStatus${activeInsp.status === s ? " active" : ""}`}
                    onClick={() => handleStatusChange(s)}
                    disabled={changingStatus || activeInsp.status === s}
                    title={s === "sent_to_customer" ? "Customer approval link will be built in Phase 8" : undefined}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {activeInsp.status === "sent_to_customer" && (
              <div className="portalDemoBanner" style={{ marginBottom:"16px" }}>
                <i className="fa-solid fa-circle-info"></i>
                <span>Status marked as Sent to Customer. Customer approval links will be built in Phase 8.</span>
              </div>
            )}

            {/* Overall notes */}
            <div className="portalCard" style={{ marginBottom:"20px" }}>
              <p className="portalCardTitle">Inspection Notes</p>
              <div className="portalFormRow">
                <div className="portalFormField">
                  <label className="portalFormLabel">Staff-Only Notes</label>
                  <textarea className="portalInspNoteTextarea" rows={3}
                    value={localOverall}
                    onChange={(e) => setLocalOverall(e.target.value)}
                    onBlur={saveOverallNotes}
                    placeholder="Internal notes about this inspection…" />
                </div>
                <div className="portalFormField">
                  <label className="portalFormLabel">Customer-Visible Notes</label>
                  <textarea className="portalInspNoteTextarea" rows={3}
                    value={localCustNotes}
                    onChange={(e) => setLocalCustNotes(e.target.value)}
                    onBlur={saveOverallNotes}
                    placeholder="Summary shown to the customer…" />
                </div>
              </div>
              {savingNotes && <p style={{ fontSize:".75rem", color:"var(--p-text-3)", marginTop:6 }}>Saving…</p>}
            </div>

            {/* Upload error */}
            {uploadError && (
              <div className="portalDemoBanner" style={{ marginBottom:"12px", background:"var(--p-danger-bg)", borderColor:"#f4c0bc", color:"var(--p-danger)" }}>
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{uploadError}</span>
                <button onClick={() => setUploadError("")} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"inherit" }}>✕</button>
              </div>
            )}

            {/* Items by category */}
            {Object.entries(groupedItems).map(([category, catItems]) => (
              <div key={category} className="portalInspCategory">
                <div className="portalInspCategoryHeader">
                  <i className="fa-solid fa-tag"></i>
                  {category}
                  <span className="portalCountBadge" style={{ marginLeft:4 }}>{catItems.length}</span>
                </div>
                {catItems.map((item) => (
                  <ItemRow key={item.id}
                    item={item}
                    photos={photos}
                    onConditionChange={handleConditionChange}
                    onNotesBlur={handleNotesBlur}
                    onRecommBlur={handleRecommBlur}
                    onVisChange={handleVisChange}
                    onUpload={handleUpload}
                    onHidePhoto={handleHidePhoto}
                    uploadingItemIds={uploadingItemIds}
                  />
                ))}
              </div>
            ))}
          </>
        ) : (
          <div className="portalEmptyState">
            <p>Could not load inspection.</p>
            <button className="portalBtn portalBtnSecondary" onClick={backToList}>Back to list</button>
          </div>
        )}
      </PortalLayout>
    );
  }

  /* ── List view ── */
  return (
    <PortalLayout title="Inspections">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Digital Inspections</h2>
          <p className="portalPageDesc">Vehicle condition inspections with photos. Start from a repair order.</p>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"16px" }}>
        <div className="portalToolbar" style={{ marginBottom:0 }}>
          <div className="portalSearchBar">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input className="portalSearchInput"
              placeholder="Search by RO #, customer, or vehicle…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize:".82rem", color:"var(--p-text-3)" }}>
              {filtered.length} inspection{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="portalFilterTabs">
          {STATUS_FILTERS.map((s) => (
            <button key={s}
              className={`portalFilterTab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span style={{ marginLeft:5, fontSize:".7rem", opacity:.7 }}>
                {s === "all" ? inspections.length : (counts[s] || "")}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="portalCard" style={{ padding:0, overflow:"hidden" }}>
        {loading ? (
          <div className="portalEmptyState"><p style={{ color:"var(--p-text-3)" }}>Loading inspections…</p></div>
        ) : error ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">⚠️</div>
            <p className="portalEmptyTitle">Could not load inspections</p>
            <p className="portalEmptyDesc">{error}</p>
            <button className="portalBtn portalBtnSecondary" onClick={loadList}>Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portalEmptyState">
            <div className="portalEmptyIcon">
              <i className="fa-solid fa-clipboard-check" style={{ opacity:.25 }}></i>
            </div>
            <p className="portalEmptyTitle">
              {search || statusFilter !== "all" ? "No inspections match your filters" : "No inspections yet"}
            </p>
            <p className="portalEmptyDesc">
              {search || statusFilter !== "all"
                ? "Try clearing the search or changing the filter."
                : "Open a repair order and click Start Inspection to begin."}
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
                <th>Created</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((insp) => {
                const ro = insp.repair_orders;
                return (
                  <tr key={insp.id} onClick={() => openEditorById(insp.id)}
                    style={{ cursor:"pointer" }}>
                    <td style={{ fontFamily:"monospace", fontWeight:700, color:"var(--p-navy)", fontSize:".88rem" }}>
                      {ro?.ro_number ?? "—"}
                    </td>
                    <td style={{ fontWeight:600 }}>
                      {ro?.customers ? `${ro.customers.first_name} ${ro.customers.last_name}` : "—"}
                    </td>
                    <td style={{ fontSize:".85rem", color:"var(--p-text-2)" }}>
                      {ro?.vehicles ? [ro.vehicles.year, ro.vehicles.make, ro.vehicles.model].filter(Boolean).join(" ") : "—"}
                    </td>
                    <td>
                      <span className={`portalBadge ${statusClass(insp.status)}`}>
                        {STATUS_LABELS[insp.status] ?? insp.status}
                      </span>
                    </td>
                    <td style={{ fontSize:".83rem", color:"var(--p-text-3)", whiteSpace:"nowrap" }}>
                      {fmtDate(insp.created_at)}
                    </td>
                    <td style={{ fontSize:".83rem", color:"var(--p-text-2)" }}>
                      {fmtDate(insp.completed_at)}
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
