import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalAppointments() {
  return (
    <PortalLayout title="Appointments">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Appointment Requests</h2>
          <p className="portalPageDesc">
            View and manage appointment requests from the public booking form and walk-ins.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> Add Request
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">📅</div>
          <p className="portalEmptyTitle">Appointment request management coming in Phase 5</p>
          <p className="portalEmptyDesc">
            Requests submitted through the public booking form will appear here.
            Staff can confirm, cancel, or convert requests directly into repair orders.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No appointments yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
