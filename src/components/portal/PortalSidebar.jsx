import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Dashboard",     href: "/portal/dashboard",     icon: "fa-solid fa-gauge-high" },
  { label: "Customers",     href: "/portal/customers",     icon: "fa-solid fa-users" },
  { label: "Vehicles",      href: "/portal/vehicles",      icon: "fa-solid fa-car" },
  { label: "Appointments",  href: "/portal/appointments",  icon: "fa-solid fa-calendar-days" },
  { label: "Repair Orders", href: "/portal/repair-orders", icon: "fa-solid fa-screwdriver-wrench" },
  { label: "Inspections",   href: "/portal/inspections",   icon: "fa-solid fa-clipboard-check" },
  { label: "Estimates",     href: "/portal/estimates",     icon: "fa-solid fa-file-invoice-dollar" },
  { label: "Invoices",      href: "/portal/invoices",      icon: "fa-solid fa-receipt" },
];

export default function PortalSidebar() {
  return (
    <aside className="portalSidebar">
      {/* Brand */}
      <div className="portalBrand">
        <p className="portalBrandName">P.A.C.E.</p>
        <p className="portalBrandSub">Power Automotive<br />Centre of Excellence</p>
        <span className="portalBrandBadge">Staff Portal</span>
      </div>

      {/* Navigation */}
      <nav className="portalNav" aria-label="Portal navigation">
        <p className="portalNavSection">Menu</p>
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              isActive ? "portalNavLink active" : "portalNavLink"
            }
          >
            <span className="portalNavIcon" aria-hidden="true">
              <i className={item.icon}></i>
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="portalSidebarFooter">
        <p className="portalVersionTag">Phase 2 — UI Shell</p>
      </div>
    </aside>
  );
}
