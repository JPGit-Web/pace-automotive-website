import { useEffect, useState } from "react";

const links = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  // { label: "Gallery", href: "#gallery" },
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

  return (
    <header className={`nav navV2 ${scrolled ? "navScrolled" : ""}`}>
      <div className="navInner navInnerV2">
        <a className="brand brandV2" href="#home" aria-label="Go to home">
          <span className="brandTextStack">
            <span className="brandTop">Power Automotive</span>
            <span className="brandBottom"><em>Centre of Excellence</em></span>
          </span>
        </a>

        <nav className="navLinks navLinksV2" aria-label="Primary navigation">
          {links.map((l) => (
            <a key={l.href} className="navLink" href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <a className="btn btnPrimary btnSmall navCta" href="#booking">
          OPENING SOON
        </a>
      </div>
    </header>
  );
}
