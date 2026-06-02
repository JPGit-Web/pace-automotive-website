import Navbar from "./components/Navbar";
import Section from "./components/Section";
import BookingForm from "./components/BookingForm";
import Footer from "./components/Footer";

/* ─────────────────────────────────────────
   Trust Strip data
   ───────────────────────────────────────── */
const trustItems = [
  { icon: "fa-solid fa-house",      label: "Family-Owned",    script: "Since Day One" },
  { icon: "fa-solid fa-location-dot", label: "Calgary Based", script: "SE Calgary" },
  { icon: "fa-solid fa-handshake",  label: "Honest Service",  script: "No Surprises" },
  { icon: "fa-solid fa-wrench",     label: "Certified Techs", script: "Done Right" },
  { icon: "fa-solid fa-star",       label: "Now Open!",       script: "Come Visit Us" },
];

/* ─────────────────────────────────────────
   Services data
   ───────────────────────────────────────── */
const services = [
  { title: "Oil Change & Maintenance",    desc: "Oil changes, fluid top-ups, filter replacements, and routine scheduled maintenance." },
  { title: "Brakes",                      desc: "Brake inspections, pads, rotors, calipers, and complete brake fluid service." },
  { title: "Tires",                       desc: "Seasonal tire swaps, flat repairs, rotations, and wheel balancing." },
  { title: "Diagnostics",                 desc: "Check engine light diagnostics and drivability troubleshooting from bumper to bumper." },
  { title: "Battery & Electrical",        desc: "Battery testing and replacement, starting/charging concerns, and lighting issues." },
  { title: "Steering & Suspension",       desc: "Shocks, struts, alignment-related handling concerns, and ride quality repairs." },
  { title: "Heating & Cooling",           desc: "Cooling system service, thermostat replacement, leak inspection, and overheating repair." },
  { title: "General Repair",              desc: "Everyday repairs and safety inspections to keep your vehicle road-ready and reliable." },
];

export default function App() {
  return (
    <>
      <Navbar />

      {/* ─── HERO ─── */}
      <section id="home" className="heroPoster">

        {/* Red/Navy top info banner */}
        <div className="heroBanner">
          <div className="heroBannerLeft">
            <span>P.A.C.E. — Power Automotive Centre of Excellence</span>
          </div>
          <div className="heroBannerRight">
            <span>(403) 453-4554</span>
            <span>Unit D 8240-31 St SE, Calgary AB</span>
            <span>Mon–Fri 8AM–5:30PM</span>
          </div>
        </div>

        <div className="container">
          <div className="posterFrame">

            {/* Logo + Contact Info */}
            <div className="posterTop">
              <div className="posterSign">
                <img
                  src="/pace-logo.png"
                  alt="P.A.C.E. — Power Automotive Centre of Excellence"
                  className="posterLogoImg"
                />
              </div>

              <div className="posterContact">
                <div className="posterContactHeader">Get In Touch</div>

                <div className="posterContactLine">
                  <span className="ico"><i className="fa-solid fa-phone"></i></span>
                  <span>Office: (403) 453-4554</span>
                </div>
                <div className="posterContactLine">
                  <span className="ico"><i className="fa-solid fa-mobile-screen"></i></span>
                  <span>Cell: (587) 579-2695</span>
                </div>
                <div className="posterContactLine">
                  <span className="ico"><i className="fa-solid fa-envelope"></i></span>
                  <span>admin@powerautomotive.ca</span>
                </div>
                <div className="posterContactLine">
                  <span className="ico"><i className="fa-solid fa-location-dot"></i></span>
                  <span>Unit D 8240-31 St SE</span>
                </div>
                <div className="posterContactCity">
                  Calgary, AB &nbsp;T2C 1H9
                </div>
                <div className="posterContactLine" style={{ marginTop: "10px" }}>
                  <span className="ico"><i className="fa-solid fa-clock"></i></span>
                  <span>Mon–Fri 8AM–5:30PM</span>
                </div>
                <div className="posterContactCity">
                  Sat–Sun: By Appointment
                </div>

                <div className="posterTag">Now Open!</div>
              </div>
            </div>

            {/* Headline + CTA + Photo Slot */}
            <div className="posterBody">
              <div className="posterCopy">
                <h1 className="posterHeadline">
                  Your Trusted Calgary<br />Auto Repair Shop
                </h1>

                <p className="posterLead">
                  Family-owned shop. Honest &amp; reliable service.<br />
                  Done right the first time — guaranteed.
                </p>

                <div className="posterActions">
                  <a className="btn btnRed" href="#contact">
                    Request Appointment
                  </a>
                  <a className="btn btnGhost" href="#services">
                    View Services
                  </a>
                </div>
              </div>

              <div className="posterPhoto">
                <img
                  src="/paceshop.png"
                  alt="P.A.C.E. — Power Automotive Centre of Excellence shop exterior"
                  className="posterPhotoImg"
                />
              </div>
            </div>

            {/* Feature Strip + Services Link */}
            <div className="posterBottom">
              <div className="featureStrip">
                <div className="featureItem">Family-Owned</div>
                <div className="featureDot" aria-hidden="true" />
                <div className="featureItem">Honest Service</div>
                <div className="featureDot" aria-hidden="true" />
                <div className="featureItem">Certified Techs</div>
                <div className="featureDot" aria-hidden="true" />
                <div className="featureItem">Calgary Local</div>
              </div>

              <a className="servicesRibbon" href="#services">
                Our Services
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ─── TRUST STRIP ─── */}
      <div className="trustStrip" aria-label="At a glance">
        <div className="container">
          <div className="trustStripInner">
            {trustItems.map((t) => (
              <div className="trustItem" key={t.label}>
                <span className="trustItemIcon" aria-hidden="true"><i className={t.icon}></i></span>
                <span className="trustItemText">
                  {t.label}
                  <span className="trustItemScript">{t.script}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── ABOUT ─── */}
      <Section
        id="about"
        title="About P.A.C.E."
        subtitle="A family-owned shop built on trust, quality workmanship, and putting the customer first — every single time. We do repairs the right way and build long-term relationships in Calgary."
      >
        <div className="split">
          <div className="panel">
            <h3 className="panelTitle">Our Promise to You</h3>
            <ul className="bullets">
              <li>Honest recommendations and clear communication before any work begins</li>
              <li>Quality repairs using trusted parts and proven processes</li>
              <li>Efficient, respectful service that values your time</li>
              <li>A professional, clean shop experience from drop-off to pick-up</li>
              <li>Calgary-local — we're your neighbours, not a franchise chain</li>
            </ul>
          </div>

          <div className="panel panelAccent">
            <h3 className="panelTitle">What You Can Expect</h3>
            <div className="stats">
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Straightforward inspections and plain-language explanations</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Your approval required before any major work starts</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Repairs done right the first time — no runaround</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Service you'll feel confident recommending to friends and family</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── SERVICES ─── */}
      <Section
        id="services"
        title="Our Services"
        subtitle="Core maintenance and repair, done with care and expertise. From an oil change to a full diagnostic — we've got you covered."
      >
        <div className="cardsGrid">
          {services.map((s) => (
            <div className="card" key={s.title}>
              <h3 className="cardTitle">{s.title}</h3>
              <p className="cardDesc">{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── CONTACT + BOOKING ─── */}
      <Section
        id="contact"
        title="Contact & Appointments"
        subtitle="Call, email, or fill out the form below to request an appointment or ask any questions."
      >
        {/* Contact + Map row */}
        <div className="contactGrid" style={{ marginBottom: "28px" }}>
          <div className="contactCard">
            <h3 className="contactTitle">Contact Details</h3>
            <div className="contactInfoBlock">
              <div className="contactLine">
                <span className="contactLineLabel">Phone</span>
                <span className="contactLineVal">
                  Office: <a href="tel:+14034534554">(403) 453-4554</a><br />
                  Cell: <a href="tel:+15875792695">(587) 579-2695</a>
                </span>
              </div>
              <div className="contactLine">
                <span className="contactLineLabel">Email</span>
                <span className="contactLineVal">
                  <a href="mailto:admin@powerautomotive.ca">admin@powerautomotive.ca</a>
                </span>
              </div>
              <div className="contactLine">
                <span className="contactLineLabel">Hours</span>
                <span className="contactLineVal">
                  Mon–Fri 8AM–5:30PM<br />
                  Sat–Sun: By Appointment Only
                </span>
              </div>
              <div className="contactLine">
                <span className="contactLineLabel">Address</span>
                <span className="contactLineVal">
                  Unit D 8240 31 St SE<br />
                  Calgary, AB&nbsp;&nbsp;T2C 1H9
                </span>
              </div>
            </div>

            <div className="contactNote">
              For any questions or inquiries, email us at{" "}
              <a href="mailto:admin@powerautomotive.ca">admin@powerautomotive.ca</a>{" "}
              or call <a href="tel:+14034534554">(403) 453-4554</a> during business hours.
            </div>
          </div>

          <div className="mapCard">
            <iframe
              title="P.A.C.E. Location Map"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2511.943579792164!2d-113.99026632224191!3d50.980233471698156!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x53717a06f9d3ada1%3A0x2b41ece6116618d9!2s8240%2031%20St%20SE%20D%2C%20Calgary%2C%20AB%20T2C%201H9!5e0!3m2!1sen!2sca!4v1768685555052!5m2!1sen!2sca"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        {/* Booking Form */}
        <BookingForm />
      </Section>

      <Footer />
    </>
  );
}
