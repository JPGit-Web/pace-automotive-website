import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalInvoices() {
  return (
    <PortalLayout title="Invoices">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Invoices</h2>
          <p className="portalPageDesc">
            Link Helcim invoices to repair orders and track payment status.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-link"></i> Link Invoice
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">🧾</div>
          <p className="portalEmptyTitle">Helcim invoice linking coming in Phase 9</p>
          <p className="portalEmptyDesc">
            Link Helcim invoice IDs and payment links to completed repair orders.
            Track payment status (unpaid, partial, paid). Helcim remains the source
            of truth — no card data is stored here.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No invoices yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
