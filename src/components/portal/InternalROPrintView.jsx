import React from "react";

/* ── Shop constants ── */
const SHOP_NAME    = "Power Automotive Centre of Excellence";
const SHOP_TAGLINE = "P.A.C.E.";
const SHOP_ADDRESS = "8240-D 31st Street SE, Calgary, AB T2C 1J1";
const SHOP_PHONE   = "(587) 579-2695";

/* Number of concern slots to always show (filled or blank) */
const MIN_CONCERN_SLOTS  = 7;
/* Number of blank material rows */
const MATERIAL_ROWS = 9;

/* ── Helpers ── */
const fullName = (c) =>
  c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-CA", {
        year: "numeric", month: "short", day: "numeric",
      })
    : "";

/* Date-only strings (YYYY-MM-DD) must not be parsed as UTC midnight — split manually. */
const fmtDateOnly = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
  });
};

/* ── Component ── */
export default function InternalROPrintView({ ro, detailData, concerns = [] }) {
  if (!ro || !detailData) return null;

  const v   = detailData.vehicles;
  const cus = detailData.customers;

  /* Build concern slots: real concerns first, then blank up to MIN_CONCERN_SLOTS */
  const filledConcerns = concerns.length > 0
    ? concerns
    : ro.customer_concern
      ? [{ id: "legacy", concern_text: ro.customer_concern }]
      : [];
  const slotCount = Math.max(filledConcerns.length, MIN_CONCERN_SLOTS);
  const slots = Array.from({ length: slotCount }, (_, i) => filledConcerns[i] ?? null);

  const vehicleDesc = v
    ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")
    : "";
  const plateLine = v?.license_plate
    ? `${v.license_plate}${v.plate_province ? ` (${v.plate_province})` : ""}`
    : "";
  const odometer = ro.mileage_in != null
    ? `${ro.mileage_in.toLocaleString()} km in${ro.mileage_out != null ? `  /  ${ro.mileage_out.toLocaleString()} km out` : ""}`
    : "";

  return (
    <div className="roPrintDoc">

      {/* ── Shop header ── */}
      <div className="roPrintShopHeader">
        <div className="roPrintShopName">{SHOP_NAME} — {SHOP_TAGLINE}</div>
        <div className="roPrintShopContact">{SHOP_ADDRESS} &nbsp;·&nbsp; {SHOP_PHONE}</div>
      </div>

      {/* ── Document title + RO number ── */}
      <div className="roPrintDocTitle">
        REPAIR ORDER WORKSHEET
        <span className="roPrintRoNum">{ro.ro_number}</span>
      </div>

      {/* ── Customer / Vehicle info grid ── */}
      <table className="roPrintInfoTable">
        <tbody>
          <tr>
            <td className="roPrintInfoCell" colSpan={3}>
              <span className="roPrintInfoLabel">CUSTOMER</span>
              <span className="roPrintInfoValue">{fullName(cus)}</span>
            </td>
            <td className="roPrintInfoCell">
              <span className="roPrintInfoLabel">DATE</span>
              <span className="roPrintInfoValue">{fmtDate(ro.created_at)}</span>
            </td>
          </tr>
          <tr>
            <td className="roPrintInfoCell">
              <span className="roPrintInfoLabel">MAKE</span>
              <span className="roPrintInfoValue">{v?.make ?? ""}</span>
            </td>
            <td className="roPrintInfoCell">
              <span className="roPrintInfoLabel">MODEL</span>
              <span className="roPrintInfoValue">{v?.model ?? ""}</span>
            </td>
            <td className="roPrintInfoCell" colSpan={2}>
              <span className="roPrintInfoLabel">YEAR &amp; TRIM</span>
              <span className="roPrintInfoValue">{[v?.year, v?.trim].filter(Boolean).join(" ")}</span>
            </td>
          </tr>
          <tr>
            <td className="roPrintInfoCell" colSpan={2}>
              <span className="roPrintInfoLabel">LICENSE PLATE</span>
              <span className="roPrintInfoValue">{plateLine}</span>
            </td>
            <td className="roPrintInfoCell" colSpan={2}>
              <span className="roPrintInfoLabel">ODOMETER</span>
              <span className="roPrintInfoValue">{odometer}</span>
            </td>
          </tr>
          <tr>
            <td className="roPrintInfoCell" colSpan={2}>
              <span className="roPrintInfoLabel">VIN</span>
              <span className="roPrintInfoValue roPrintMono">{v?.vin ?? ""}</span>
            </td>
            <td className="roPrintInfoCell" colSpan={2}>
              <span className="roPrintInfoLabel">PROMISED / DUE</span>
              <span className="roPrintInfoValue">{fmtDateOnly(ro.promised_date)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Concerns ── */}
      <div className="roPrintSection">
        <div className="roPrintSectionTitle">CONCERNS</div>
        {slots.map((slot, i) => (
          <div key={i} className="roPrintConcernSlot">
            <div className="roPrintConcernRow">
              <span className="roPrintConcernNum">{i + 1}.</span>
              <span className="roPrintConcernText">{slot?.concern_text ?? ""}</span>
            </div>
            <div className="roPrintConcernWriteLine"></div>
            <div className="roPrintConcernWriteLine"></div>
          </div>
        ))}
      </div>

      {/* ── Materials ── */}
      <div className="roPrintSection">
        <div className="roPrintSectionTitle">MATERIALS</div>
        <table className="roPrintMaterialsTable">
          <thead>
            <tr>
              <th className="roPrintMatQtyHdr">QTY</th>
              <th className="roPrintMatDescHdr">DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MATERIAL_ROWS }).map((_, i) => (
              <tr key={i}>
                <td className="roPrintMatQtyCell"></td>
                <td className="roPrintMatDescCell"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Technician notes + signature ── */}
      <div className="roPrintSection roPrintTechSection">
        <div className="roPrintSectionTitle">TECHNICIAN NOTES</div>
        <div className="roPrintTechNotesArea"></div>
        <div className="roPrintSigRow">
          <div className="roPrintSigBlock">
            <div className="roPrintSigLine"></div>
            <div className="roPrintSigLabel">Technician Signature</div>
          </div>
          <div className="roPrintSigBlock">
            <div className="roPrintSigLine"></div>
            <div className="roPrintSigLabel">Date Completed</div>
          </div>
        </div>
      </div>

    </div>
  );
}
