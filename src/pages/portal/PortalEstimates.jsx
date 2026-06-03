import PortalLayout from "../../components/portal/PortalLayout";

export default function PortalEstimates() {
  return (
    <PortalLayout title="Estimates">
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Estimates</h2>
          <p className="portalPageDesc">
            Build estimates and send secure approval links to customers by email.
          </p>
        </div>
        <button className="portalBtn portalBtnPrimary" disabled>
          <i className="fa-solid fa-plus"></i> New Estimate
        </button>
      </div>

      <div className="portalCard">
        <div className="portalEmptyState">
          <div className="portalEmptyIcon">📄</div>
          <p className="portalEmptyTitle">Estimate builder and approval links coming in Phase 8</p>
          <p className="portalEmptyDesc">
            Build line-item estimates with labour, parts, and fees. Send a secure
            one-click approval link to the customer by email. Track approval status
            in real time.
          </p>
          <button className="portalBtn portalBtnSecondary" disabled>
            No estimates yet
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}
