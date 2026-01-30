import { useEffect, useState } from "react";

const links = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (e, href) => {
    e.preventDefault();

    const el = document.querySelector(href);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });

    // keeps URL hash in sync without the “jump”
    window.history.replaceState(null, "", href);
  };

  return (
    <header className={`nav navV2 ${scrolled ? "navScrolled" : ""}`}>
      <div className="navInner navInnerV2">
        <a className="brand brandV2" href="#home" onClick={(e) => goTo(e, "#home")} aria-label="Go to home">
          <span className="brandTextStack">
            <span className="brandTop">Power Automotive</span>
            <span className="brandBottom"><em>Centre of Excellence</em></span>
          </span>
        </a>

        <nav className="navLinks navLinksV2" aria-label="Primary navigation">
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

        <a className="btn btnPrimary btnSmall navCta" href="#booking" onClick={(e) => goTo(e, "#booking")}>
          OPENING SOON
        </a>
      </div>
    </header>
  );
}
