export default function Section({ id, title, subtitle, children, variant }) {
  const classes = ["section"];
  if (variant === "hero") classes.push("sectionHero");

  return (
    <section id={id} className={classes.join(" ")}>
      <div className="container">
        {(title || subtitle) && variant !== "hero" && (
          <header className="sectionHeader">
            {title && <h2 className="sectionTitle">{title}</h2>}
            {subtitle && <p className="sectionSubtitle">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
