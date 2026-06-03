import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalVehicles() {
  return (
    <PortalLayout title="Vehicles">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Vehicles</h2>
          <p className="portalPageDesc">View and manage vehicles linked to customer accounts.</p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> Add Vehicle
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">🚗</div>
          <p className="portalEmptyTitle">Vehicle records coming in Phase 4</p>
          <p className="portalEmptyDesc">
            Year, make, model, VIN, license plate, and service history
            will be tracked per vehicle and linked to customer profiles.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No vehicles yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
