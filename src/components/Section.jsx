export default function Section({ id, title, subtitle, children }) {
  return (
    <section id={id} className="section">
      <div className="container">
        {(title || subtitle) && (
          <header className="sectionHeader">
            {title    && <h2 className="sectionTitle">{title}</h2>}
            {subtitle && <p className="sectionSubtitle">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
