import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalInspections() {
  return (
    <PortalLayout title="Inspections">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Digital Inspections</h2>
          <p className="portalPageDesc">
            Complete vehicle inspections with condition ratings, notes, and photos.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> New Inspection
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">📋</div>
          <p className="portalEmptyTitle">Digital inspections with photos coming in Phase 7</p>
          <p className="portalEmptyDesc">
            Inspection items by category (tires, brakes, fluids, lights, etc.) with
            good / fair / needs attention / urgent ratings. Staff upload photos per item.
            Customers view results via a secure email link.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No inspections yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
