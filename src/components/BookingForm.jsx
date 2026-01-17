export default function BookingForm() {
  return (
    <form
      className="form"
      name="pace-booking"
      method="POST"
      data-netlify="true"
      data-netlify-honeypot="bot-field"
    >
      {/* Netlify required hidden fields */}
      <input type="hidden" name="form-name" value="pace-booking" />
      <p className="hidden">
        <label>
          Don’t fill this out if you’re human: <input name="bot-field" />
        </label>
      </p>

      <div className="formGrid">
        <label className="field">
          <span>Full Name</span>
          <input name="name" type="text" required placeholder="John Doe" />
        </label>

        <label className="field">
          <span>Phone</span>
          <input name="phone" type="tel" required placeholder="(403) 000-0000" />
        </label>

        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required placeholder="you@email.com" />
        </label>

        <label className="field">
          <span>Vehicle</span>
          <input name="vehicle" type="text" placeholder="2016 Honda Civic" />
        </label>

        <label className="field">
          <span>Service Needed</span>
          <select name="service" defaultValue="Diagnostics">
            <option>Diagnostics</option>
            <option>Oil & Fluids</option>
            <option>Brakes</option>
            <option>Tires</option>
            <option>Battery & Electrical</option>
            <option>General Repair</option>
            <option>Other</option>
          </select>
        </label>

        <label className="field">
          <span>Preferred Date/Time</span>
          <input name="preferred" type="text" placeholder="e.g., Tuesday 10am" />
        </label>

        <label className="field fieldFull">
          <span>Message</span>
          <textarea
            name="message"
            rows="5"
            placeholder="Tell us what’s going on (symptoms, noises, warning lights, etc.)"
          />
        </label>
      </div>

      <div className="formActions">
        <button className="btn btnPrimary" type="submit">
          Send Request
        </button>
        <p className="formHint">
          We’ll reply as soon as possible to confirm details and availability.
        </p>
      </div>
    </form>
  );
}
