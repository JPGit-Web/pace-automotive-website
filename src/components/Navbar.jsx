import { useEffect, useState } from "react";

const links = [
  { label: "Home",     href: "#home" },
  { label: "About",    href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Contact",  href: "#contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (e, href) => {
    e.preventDefault();
    setMenuOpen(false);
    const el = document.querySelector(href);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", href);
  };

  return (
    <header className={`nav navV2 ${scrolled ? "navScrolled" : ""}`}>
      <div className="container navInnerV2">

        {/* Brand */}
        <a
          className="brand brandV2"
          href="#home"
          onClick={(e) => goTo(e, "#home")}
          aria-label="P.A.C.E. — Power Automotive Centre of Excellence — go to home"
        >
          <span className="brandTextStack">
            <span className="brandTop">Power Automotive</span>
            <span className="brandBottom">Centre of Excellence</span>
          </span>
        </a>

        {/* Desktop nav links */}
        <nav className="navLinksV2" aria-label="Primary navigation">
          {links.map((l) => (
            <a
              key={l.href}
              className="navLink"
              href={l.href}
              onClick={(e) => goTo(e, l.href)}
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <a
          className="btn btnRed navCta"
          href="#contact"
          onClick={(e) => goTo(e, "#contact")}
        >
          Book Appointment
        </a>

      </div>
    </header>
  );
}
