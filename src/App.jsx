import { Routes, Route, Navigate } from "react-router-dom";

import PublicSite          from "./pages/PublicSite";
import ApprovalPage        from "./pages/ApprovalPage";

import PortalLogin         from "./pages/portal/PortalLogin";
import PortalDashboard     from "./pages/portal/PortalDashboard";
import PortalCustomers     from "./pages/portal/PortalCustomers";
import PortalVehicles      from "./pages/portal/PortalVehicles";
import PortalAppointments  from "./pages/portal/PortalAppointments";
import PortalRepairOrders  from "./pages/portal/PortalRepairOrders";
import PortalInspections   from "./pages/portal/PortalInspections";
import PortalEstimates     from "./pages/portal/PortalEstimates";
import PortalInvoices      from "./pages/portal/PortalInvoices";

import ProtectedRoute      from "./components/portal/ProtectedRoute";

/* Wrap a page in ProtectedRoute cleanly */
const protect = (Page) => (
  <ProtectedRoute>
    <Page />
  </ProtectedRoute>
);

export default function App() {
  return (
    <Routes>
      {/* ── Public website ── */}
      <Route path="/" element={<PublicSite />} />

      {/* ── Customer approval links (token-secured, no login required) ── */}
      <Route path="/approve/:token" element={<ApprovalPage />} />

      {/* ── Staff portal login ── */}
      <Route path="/portal" element={<PortalLogin />} />

      {/* ── Protected portal pages ── */}
      <Route path="/portal/dashboard"     element={protect(PortalDashboard)} />
      <Route path="/portal/customers"     element={protect(PortalCustomers)} />
      <Route path="/portal/vehicles"      element={protect(PortalVehicles)} />
      <Route path="/portal/appointments"  element={protect(PortalAppointments)} />
      <Route path="/portal/repair-orders" element={protect(PortalRepairOrders)} />
      <Route path="/portal/inspections"   element={protect(PortalInspections)} />
      <Route path="/portal/estimates"     element={protect(PortalEstimates)} />
      <Route path="/portal/invoices"      element={protect(PortalInvoices)} />

      {/* ── Catch-all → public homepage ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
