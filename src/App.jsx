import Navbar from "./components/Navbar";
import Section from "./components/Section";
import BookingForm from "./components/BookingForm";
import Footer from "./components/Footer";

export default function App() {
  return (
    <>
      <Navbar />

      {/* HERO (template-style) */}
      <section id="home" className="heroV2">
        <div className="container heroV2Inner">
          <div className="heroLeft">
            <p className="heroKicker">Power Automotive</p>
            <h1 className="heroHeadline">
              OPENING SOON
              <span className="heroDot">!</span>
            </h1>

            <p className="heroLead">
              <strong><em>Centre of Excellence</em></strong> isn’t just a name, it’s how we operate.
            </p>

            <div className="heroBadges">
              <span className="pill">Diagnostics</span>
              <span className="pill">Brakes</span>
              <span className="pill">Oil & Fluids</span>
              <span className="pill">Tires</span>
            </div>

            <div className="heroActions">
              <a className="btn btnPrimary heroBtn" href="#booking">
                Request Appointment
              </a>
              <a className="btn btnGhost heroBtn" href="#services">
                View Services
              </a>
            </div>
          </div>

          <div className="heroRight">
            {/* Circular logo like the template */}
            <div className="logoRing">
              <div className="logoCircle">
                <img src="/pace-logo.png" alt="P.A.C.E. logo" className="logoCircleImg" />
              </div>
            </div>

            {/* small decorative bits (optional style) */}
            <div className="heroDecor heroDecor1" aria-hidden="true" />
            <div className="heroDecor heroDecor2" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <Section
        id="about"
        title="About P.A.C.E."
        subtitle="We are a family-owned shop built on trust, quality workmanship, and customer-first service. Established in 2023, we’re focused on doing repairs the right way and building long-term relationships in Calgary."
      >
        <div className="split">
          <div className="panel">
            <h3 className="panelTitle">Our Promise</h3>
            <ul className="bullets">
              <li>Honest recommendations and clear communication</li>
              <li>Quality repairs using trusted parts and proven processes</li>
              <li>Efficient service that respects your time</li>
              <li>A professional, clean shop experience from start to finish</li>
            </ul>
          </div>

          <div className="panel panelAccent">
            <h3 className="panelTitle">What you can expect</h3>
            <div className="stats">
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Straightforward inspections and explanations</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Approval before any major work begins</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Repairs done right the first time</p>
              </div>
              <div className="stat">
                <p className="statNum">✔</p>
                <p className="statText">Service you’ll feel confident recommending</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* GALLERY */}
      {/* <Section
        id="gallery"
        title="Gallery"
        subtitle="A peek into our shop and the work we’re proud of."
      >
        <div className="galleryGrid">
          <div className="galleryTile">Photo 1</div>
          <div className="galleryTile">Photo 2</div>
          <div className="galleryTile">Photo 3</div>
          <div className="galleryTile">Photo 4</div>
        </div>
        <p className="smallNote">Replace these placeholders with real shop photos later.</p>
      </Section> */}

      {/* SERVICES */}
      <Section id="services" title="Services" subtitle="Core maintenance and repair, done with care.">
        <div className="cardsGrid">
          {[
            { title: "Oil Change & Maintenance", desc: "Oil changes, fluid checks, filters, and routine maintenance." },
            { title: "Brakes", desc: "Brake inspections, pads, rotors, calipers, and brake fluid service." },
            { title: "Tires", desc: "Seasonal tire swaps, tire repair, rotations, and balancing." },
            { title: "Diagnostics", desc: "Check engine light diagnostics and drivability troubleshooting." },
            { title: "Battery & Electrical", desc: "Battery testing/replacement, starting/charging concerns, lighting." },
            { title: "Steering & Suspension", desc: "Shocks, struts, alignment-related concerns, and handling issues." },
            { title: "Heating & Cooling", desc: "Cooling system service, thermostats, leaks, and overheating concerns." },
            { title: "General Repair", desc: "Everyday repairs and inspections to keep your vehicle safe and reliable." },
          ].map((s) => (
            <div className="card" key={s.title}>
              <h3 className="cardTitle">{s.title}</h3>
              <p className="cardDesc">{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* BOOKING */}
      {/* <Section
        id="booking"
        title="Request an Appointment"
        subtitle="Send us your details and we’ll confirm availability."
      >
        <BookingForm />
      </Section> */}

      {/* CONTACT */}
      <Section id="contact" title="Contact" subtitle="Call, email, or send a message anytime.">
        <div className="contactGrid">
          <div className="contactCard">
            <h3 className="contactTitle">Contact Details</h3>
            <p className="contactLine">
              <span>Phone:</span> <a href="tel:+14030000000">(403) 453-4554</a>
            </p>
            <p className="contactLine">
              <span>Email:</span> <a href="mailto:info@paceauto.ca">powerautomotivecentre1@gmail.com</a>
            </p>
            <p className="contactLine">
              <span>Hours:</span> Mon–Fri 8am–6pm
              <br></br><span></span>Sat–Sun By Appointment Only
            </p>
            <p className="contactLine">
              <span>Address:</span> Unit D 8240 31 St SE T2C 1H9, Calgary, AB
            </p>

            <p className="contactNote">
              For any questions or inquiries, please email us at{" "}
              <a href="mailto:powerautomotivecentre1@gmail.com">
                powerautomotivecentre1@gmail.com
              </a>{" "}
              or call{" "}
              <a href="tel:14034534554">(403) 453-4554</a>.
            </p>


            {/* <div className="contactBtns">
              <a className="btn btnPrimary" href="#booking">Book</a>
              <a className="btn btnGhost" href="tel:+14030000000">Call Now</a>
            </div> */}
          </div>

          <div className="mapCard">
            <iframe
              title="P.A.C.E. Location Map"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2511.943579792164!2d-113.99026632224191!3d50.980233471698156!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x53717a06f9d3ada1%3A0x2b41ece6116618d9!2s8240%2031%20St%20SE%20D%2C%20Calgary%2C%20AB%20T2C%201H9!5e0!3m2!1sen!2sca!4v1768685555052!5m2!1sen!2sca"
              width="100%"
              height="320"
              style={{ border: 0, borderRadius: "16px" }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

        </div>
      </Section>

      <Footer />
    </>
  );
}
