const navLinks = [
  { label: "Home",              href: "#home" },
  { label: "About",             href: "#about" },
  { label: "Services",          href: "#services" },
  { label: "Contact",           href: "#contact" },
  { label: "Request Appointment", href: "#contact" },
];

const services = [
  "Oil Change & Maintenance",
  "Brakes",
  "Tires",
  "Diagnostics",
  "Battery & Electrical",
  "Steering & Suspension",
  "Heating & Cooling",
  "General Repair",
];

const goTo = (e, href) => {
  e.preventDefault();
  const el = document.querySelector(href);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", href);
};

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">

        {/* ─── Top Grid ─── */}
        <div className="footerTop">

          {/* Brand column */}
          <div className="footerBrandCol">
            <p className="footerLogo">P.A.C.E.</p>
            <p className="footerTagline">Power Automotive<br />Centre of Excellence</p>
            <p className="footerDesc">
              Family-owned auto repair in SE Calgary.
              Honest service, quality workmanship, done right the first time.
            </p>
          </div>

          {/* Navigation column */}
          <div>
            <p className="footerColTitle">Navigate</p>
            <ul className="footerLinks">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} onClick={(e) => goTo(e, l.href)}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Services column */}
          <div>
            <p className="footerColTitle">Services</p>
            <ul className="footerLinks">
              {services.map((s) => (
                <li key={s}>
                  <a href="#services" onClick={(e) => goTo(e, "#services")}>{s}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact / Hours column */}
          <div>
            <p className="footerColTitle">Contact & Hours</p>

            <div className="footerContactList">
              <div className="footerContactItem">
                <span className="ico">☎</span>
                <span>
                  <a href="tel:+14034534554">(403) 453-4554</a>
                </span>
              </div>
              <div className="footerContactItem">
                <span className="ico">✉</span>
                <span>
                  <a href="mailto:admin@powerautomotive.ca">admin@powerautomotive.ca</a>
                </span>
              </div>
              <div className="footerContactItem">
                <span className="ico">📍</span>
                <span>Unit D 8240 31 St SE<br />Calgary, AB &nbsp;T2C 1H9</span>
              </div>
            </div>

            <div className="footerHours" style={{ marginTop: "16px" }}>
              <div className="footerHoursRow">
                <span>Mon – Fri</span>
                <span>8:00 AM – 5:30 PM</span>
              </div>
              <div className="footerHoursRow">
                <span>Sat – Sun</span>
                <span>By Appointment</span>
              </div>
            </div>
          </div>

        </div>

        {/* ─── Bottom bar ─── */}
        <div className="footerBottom">
          <p className="footerCopy">
            © {new Date().getFullYear()} P.A.C.E. Repair &amp; Service — Power Automotive Centre of Excellence. All rights reserved.
          </p>
          <span className="footerBadge">Honest Work, Every Time</span>
        </div>

      </div>
    </footer>
  );
}
