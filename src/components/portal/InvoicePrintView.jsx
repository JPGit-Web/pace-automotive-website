import React from "react";

/* ── Shop constants ── */
const SHOP_NAME    = "Power Automotive Centre of Excellence";
const SHOP_TAGLINE = "P.A.C.E.";
const SHOP_ADDRESS = "8240-D 31st Street Southeast, Calgary, AB T2C 1J1";
const SHOP_PHONE   = "(587) 579-2695";
const SHOP_EMAIL   = "admin@powerautomotive.ca";
const SHOP_WEBSITE = "https://powerautomotive.ca";

const LEGAL_LINES = [
  "PAYMENT: Payment is due upon completion of service and before vehicle release. We accept cash, debit, and major credit cards.",
  "STORAGE: Vehicles not collected within 48 hours of notification that work is complete may be subject to storage fees.",
  "WARRANTY: Parts are warranted per manufacturer warranty. Labour warranty is 30 days from date of service. Warranty does not apply to pre-existing conditions, customer-supplied parts, or subsequent repairs performed elsewhere.",
  "AUTHORIZATION: By accepting this invoice, the customer acknowledges that the described work was authorized and performed satisfactorily.",
];

/* ── Helpers ── */
const fmtCents  = (c) => (c != null ? "$" + (c / 100).toFixed(2) : "—");
const fmtDate   = (iso) => iso
  ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
  : "—";
const fullName  = (c) => (c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—");

/* Discount items: show stored-positive amounts as negative on the printed invoice.
   Calculations in the database are unaffected — this is display-only. */
const fmtItemPrice = (cents, item) => {
  if (cents == null) return "—";
  const neg = item.item_type === "discount" && cents > 0;
  return (neg ? "-$" : "$") + Math.abs(cents / 100).toFixed(2);
};

const ITEM_TYPE_LABELS = {
  labour: "Labour", labor: "Labour", part: "Part", parts: "Parts",
  shop_supply: "Shop Supply", fee: "Fee", discount: "Discount",
};

/* ── Component ── */
export default function InvoicePrintView({ invoice }) {
  if (!invoice) return null;

  const { ro, customer, vehicle, concerns = [], items = [], printItems = [] } = invoice;

  /* Prefer helcim_invoice_items; fall back to printItems (estimate items) */
  const lineItems = items.length > 0 ? items : printItems;

  const printDate = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const invoiceDate = fmtDate(invoice.issued_at || invoice.created_at);

  /* Payment status label */
  const payLabels = { unpaid: "Unpaid", partial: "Partially Paid", paid: "Paid in Full", refunded: "Refunded", voided: "Voided" };
  const payLabel  = payLabels[invoice.payment_status] ?? invoice.payment_status ?? "—";
  const isPaid    = invoice.payment_status === "paid";
  const balanceDue = invoice.amount_due_cents ?? invoice.total_cents;

  /* Vehicle description */
  const vehicleDesc = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : null;

  /* Concerns: use structured list, fall back to legacy customer_concern text */
  const hasConcerns = concerns.length > 0 || !!ro?.customer_concern;

  return (
    <div className="invPrintDoc">

      {/* ── Header: shop info ── */}
      <div className="invPrintHeader">
        <div className="invPrintHeaderShop">
          <div className="invPrintShopTitle">{SHOP_NAME}</div>
          <div className="invPrintShopTagline">{SHOP_TAGLINE}</div>
        </div>
        <div className="invPrintHeaderContact">
          <div>{SHOP_ADDRESS}</div>
          <div>{SHOP_PHONE}</div>
          <div>{SHOP_EMAIL}</div>
          <div>{SHOP_WEBSITE}</div>
        </div>
      </div>

      {/* ── Invoice title + meta ── */}
      <div className="invPrintDocTitle">INVOICE</div>

      <div className="invPrintMetaRow">
        {invoice.helcim_invoice_number && (
          <div className="invPrintMetaItem">
            <span className="invPrintMetaLabel">Invoice #</span>
            <span className="invPrintMetaValue" style={{ fontFamily: "monospace" }}>{invoice.helcim_invoice_number}</span>
          </div>
        )}
        {ro?.ro_number && (
          <div className="invPrintMetaItem">
            <span className="invPrintMetaLabel">RO #</span>
            <span className="invPrintMetaValue" style={{ fontFamily: "monospace" }}>{ro.ro_number}</span>
          </div>
        )}
        <div className="invPrintMetaItem">
          <span className="invPrintMetaLabel">Invoice Date</span>
          <span className="invPrintMetaValue">{invoiceDate}</span>
        </div>
        <div className="invPrintMetaItem">
          <span className="invPrintMetaLabel">Printed</span>
          <span className="invPrintMetaValue">{printDate}</span>
        </div>
        <div className="invPrintMetaItem">
          <span className="invPrintMetaLabel">Payment Status</span>
          <span className="invPrintMetaValue">{payLabel}</span>
        </div>
      </div>

      {/* ── Bill to + Vehicle ── */}
      <div className="invPrintBillVehicle">
        <div className="invPrintCol">
          <div className="invPrintColTitle">Bill To</div>
          <div className="invPrintColValue">
            <div style={{ fontWeight: 600 }}>{fullName(customer)}</div>
            {customer?.phone && <div>{customer.phone}</div>}
            {customer?.email && <div>{customer.email}</div>}
          </div>
        </div>
        {vehicle && (
          <div className="invPrintCol">
            <div className="invPrintColTitle">Vehicle</div>
            <div className="invPrintColValue">
              {vehicleDesc && <div style={{ fontWeight: 600 }}>{vehicleDesc}</div>}
              {vehicle.color && <div>Colour: {vehicle.color}</div>}
              {vehicle.vin && <div>VIN: <span style={{ fontFamily: "monospace" }}>{vehicle.vin}</span></div>}
              {vehicle.license_plate && (
                <div>Plate: {vehicle.license_plate}{vehicle.plate_province ? ` (${vehicle.plate_province})` : ""}</div>
              )}
              {ro?.mileage_in  != null && <div>Odometer In:  {ro.mileage_in.toLocaleString()} km</div>}
              {ro?.mileage_out != null && <div>Odometer Out: {ro.mileage_out.toLocaleString()} km</div>}
            </div>
          </div>
        )}
      </div>

      {/* ── Customer concerns ── */}
      {hasConcerns && (
        <div className="invPrintConcerns">
          <div className="invPrintConcernsTitle">Customer Concerns</div>
          {concerns.length > 0 ? (
            <ol className="invPrintConcernsList">
              {concerns.map((c) => <li key={c.id}>{c.concern_text}</li>)}
            </ol>
          ) : (
            <div>{ro.customer_concern}</div>
          )}
        </div>
      )}

      {/* ── Line items ── */}
      <table className="invPrintTable">
        <thead>
          <tr>
            <th style={{ width: "42%" }}>Description</th>
            <th>Type</th>
            <th className="invPrintRight">Qty</th>
            <th className="invPrintRight">Unit Price</th>
            <th className="invPrintRight">Total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.length > 0 ? (
            lineItems.map((item, i) => (
              <tr key={item.id ?? i}>
                <td>{item.description}</td>
                <td>{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type ?? "—"}</td>
                <td className="invPrintRight">{item.item_type === "discount" ? "—" : item.quantity}</td>
                <td className="invPrintRight">{fmtItemPrice(item.unit_price_cents, item)}</td>
                <td className="invPrintRight">{fmtItemPrice(item.line_total_cents, item)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#666", fontStyle: "italic" }}>
                No line items recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div className="invPrintTotalsWrap">
        <div className="invPrintTotalsTable">
          <div className="invPrintTotalRow">
            <span>Subtotal</span>
            <span>{fmtCents(invoice.subtotal_cents)}</span>
          </div>
          <div className="invPrintTotalRow">
            <span>GST (5%)</span>
            <span>{fmtCents(invoice.tax_cents)}</span>
          </div>
          <div className="invPrintTotalRow invPrintTotalGrand">
            <span>TOTAL</span>
            <span>{fmtCents(invoice.total_cents)}</span>
          </div>
          {(invoice.amount_paid_cents ?? 0) > 0 && (
            <div className="invPrintTotalRow">
              <span>Amount Paid</span>
              <span>{fmtCents(invoice.amount_paid_cents)}</span>
            </div>
          )}
          <div className={`invPrintTotalRow invPrintBalanceDue${isPaid ? " invPrintBalancePaid" : ""}`}>
            <span>BALANCE DUE</span>
            <span>{isPaid ? "$0.00" : fmtCents(balanceDue)}</span>
          </div>
        </div>
      </div>

      {/* ── Notes (invoice-level only — no internal RO notes) ── */}
      {invoice.notes && (
        <div className="invPrintNotes">
          <div className="invPrintNotesTitle">Notes</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
        </div>
      )}

      {/* ── Signature block ── */}
      <div className="invPrintSignature">
        <div className="invPrintSigBlock">
          <div className="invPrintSigLine"></div>
          <div className="invPrintSigLabel">Customer Signature &amp; Date</div>
        </div>
        <div className="invPrintSigBlock">
          <div className="invPrintSigLine"></div>
          <div className="invPrintSigLabel">Service Advisor / Technician</div>
        </div>
      </div>

      {/* ── Legal text ── */}
      <div className="invPrintLegal">
        {LEGAL_LINES.map((line, i) => <p key={i}>{line}</p>)}
      </div>

    </div>
  );
}
