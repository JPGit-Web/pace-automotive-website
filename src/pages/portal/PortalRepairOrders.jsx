import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalRepairOrders() {
  return (
    <PortalLayout title="Repair Orders">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Repair Orders</h2>
          <p className="portalPageDesc">
            Create and track repair orders through the full shop workflow.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> New Repair Order
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">🔧</div>
          <p className="portalEmptyTitle">Repair order workflow coming in Phase 6</p>
          <p className="portalEmptyDesc">
            Full repair order management including status tracking, mileage in/out,
            customer concern, cause, correction, and links to inspections and estimates.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No repair orders yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
