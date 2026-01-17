export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footerInner">
        <p className="footerBrand">P.A.C.E. — Power Automotive Centre of Excellence</p>
        <p className="footerSmall">© {new Date().getFullYear()} P.A.C.E. Repair & Service. All rights reserved.</p>
      </div>
    </footer>
  );
}
