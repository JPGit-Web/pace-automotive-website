import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalCustomers() {
  return (
    <PortalLayout title="Customers">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Customers</h2>
          <p className="portalPageDesc">Search, view, and manage customer records.</p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> New Customer
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">👥</div>
          <p className="portalEmptyTitle">Customer database coming in Phase 4</p>
          <p className="portalEmptyDesc">
            Customer records with name, contact info, preferred contact method,
            vehicles, and repair history will be managed here.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No customers yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
