import { useState } from "react";

const SERVICES = [
  "Diagnostics",
  "Oil Change & Maintenance",
  "Brakes",
  "Tires",
  "Battery & Electrical",
  "Steering & Suspension",
  "Heating & Cooling",
  "General Repair",
  "Other",
];

const EMPTY = {
  name:       "",
  phone:      "",
  email:      "",
  vehicle:    "",
  service:    "Diagnostics",
  preferred:  "",
  message:    "",
  consent:    false,
};

export default function BookingForm() {
  const [fields, setFields]   = useState(EMPTY);
  const [errors, setErrors]   = useState({});
  const [status, setStatus]   = useState("idle"); // idle | loading | success | error
  const [errMsg, setErrMsg]   = useState("");

  /* ── Validation ── */
  const validate = (f) => {
    const e = {};
    if (!f.name.trim())                     e.name    = "Full name is required.";
    if (!f.phone.trim())                    e.phone   = "Phone number is required.";
    if (!f.email.trim())                    e.email   = "Email address is required.";
    else if (!/\S+@\S+\.\S+/.test(f.email)) e.email   = "Please enter a valid email.";
    if (!f.consent)                         e.consent = "Please confirm you agree to be contacted.";
    return e;
  };

  /* ── Field handler ── */
  const handle = (e) => {
    const { name, value, type, checked } = e.target;
    setFields((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error on change
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const errs = validate(fields);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setStatus("loading");
    setErrMsg("");

    try {
      const res = await fetch("/.netlify/functions/send-inquiry", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Server error (${res.status})`);
      }

      setStatus("success");
      setFields(EMPTY);
      setErrors({});
    } catch (err) {
      setStatus("error");
      setErrMsg(err.message || "Something went wrong. Please try again or call us directly.");
    }
  };

  const isLoading = status === "loading";

  return (
    <div className="formWrap">
      <h3 className="formTitle">Request an Appointment</h3>
      <p className="formSubtitle">
        Fill out the form below and we'll get back to you as soon as possible to confirm your appointment.
      </p>

      {/* Success */}
      {status === "success" && (
        <div className={`formStatus success show`} role="alert">
          ✅ &nbsp;Your request has been sent! We'll be in touch shortly to confirm your appointment. Check your inbox for a confirmation email.
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className={`formStatus error show`} role="alert">
          ⚠️ &nbsp;{errMsg}
        </div>
      )}

      {status !== "success" && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="formGrid">

            {/* Full Name */}
            <label className="field">
              <span>Full Name *</span>
              <input
                name="name"
                type="text"
                value={fields.name}
                onChange={handle}
                placeholder="John Doe"
                autoComplete="name"
                aria-required="true"
                aria-describedby={errors.name ? "err-name" : undefined}
              />
              {errors.name && <span id="err-name" style={{ color: "var(--red)", fontSize: ".78rem", textTransform: "none", letterSpacing: 0 }}>{errors.name}</span>}
            </label>

            {/* Phone */}
            <label className="field">
              <span>Phone *</span>
              <input
                name="phone"
                type="tel"
                value={fields.phone}
                onChange={handle}
                placeholder="(403) 000-0000"
                autoComplete="tel"
                aria-required="true"
                aria-describedby={errors.phone ? "err-phone" : undefined}
              />
              {errors.phone && <span id="err-phone" style={{ color: "var(--red)", fontSize: ".78rem", textTransform: "none", letterSpacing: 0 }}>{errors.phone}</span>}
            </label>

            {/* Email */}
            <label className="field">
              <span>Email Address *</span>
              <input
                name="email"
                type="email"
                value={fields.email}
                onChange={handle}
                placeholder="you@email.com"
                autoComplete="email"
                aria-required="true"
                aria-describedby={errors.email ? "err-email" : undefined}
              />
              {errors.email && <span id="err-email" style={{ color: "var(--red)", fontSize: ".78rem", textTransform: "none", letterSpacing: 0 }}>{errors.email}</span>}
            </label>

            {/* Vehicle */}
            <label className="field">
              <span>Vehicle (Year / Make / Model)</span>
              <input
                name="vehicle"
                type="text"
                value={fields.vehicle}
                onChange={handle}
                placeholder="e.g. 2018 Toyota Camry"
              />
            </label>

            {/* Service */}
            <label className="field">
              <span>Service Needed</span>
              <select name="service" value={fields.service} onChange={handle}>
                {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            {/* Preferred Date / Time */}
            <label className="field">
              <span>Preferred Date / Time</span>
              <input
                name="preferred"
                type="text"
                value={fields.preferred}
                onChange={handle}
                placeholder="e.g. Thursday morning, any weekday after 2pm"
              />
            </label>

            {/* Message */}
            <label className="field fieldFull">
              <span>Describe the Issue / Additional Details</span>
              <textarea
                name="message"
                rows={5}
                value={fields.message}
                onChange={handle}
                placeholder="Describe what's going on — symptoms, warning lights, noises, or anything else we should know."
              />
            </label>

            {/* Consent */}
            <label className="field fieldFull consentRow">
              <input
                type="checkbox"
                name="consent"
                checked={fields.consent}
                onChange={handle}
                aria-required="true"
                aria-describedby={errors.consent ? "err-consent" : undefined}
              />
              <span className="consentText">
                I agree to be contacted by P.A.C.E. — Power Automotive Centre of Excellence at the phone number and/or email address provided above regarding my service inquiry or appointment request.
                {errors.consent && (
                  <span id="err-consent" style={{ display: "block", color: "var(--red)", fontSize: ".78rem", marginTop: "4px" }}>
                    {errors.consent}
                  </span>
                )}
              </span>
            </label>

          </div>

          <div className="formActions">
            <button
              className="btn btnRed"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Sending…" : "Send Request"}
            </button>

            <p className="formHint">
              We'll reply as soon as possible to confirm your appointment details and availability.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
