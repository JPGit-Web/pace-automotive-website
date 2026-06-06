import PortalLayout from "../../components/portal/PortalLayout";

/* ── Daily workflow steps ─────────────────────────────────── */
const WORKFLOW = [
  "Check Dashboard",
  "Review Appointments",
  "Convert Appointment to RO",
  "Add Customer, Vehicle & Concerns",
  "Print Internal RO",
  "Build Estimate",
  "Send Approval",
  "Create Invoice",
  "Take Payment",
  "Close Repair Order",
];

/* ── Accordion section definitions ───────────────────────── */
const SECTIONS = [
  {
    id: "dashboard",
    icon: "fa-solid fa-gauge-high",
    title: "Dashboard",
    content: (
      <>
        <p>The Dashboard is your daily starting point. Check it every morning and after lunch.</p>
        <ul>
          <li><strong>Stat cards</strong> — open ROs, pending approvals, today's appointments, unpaid invoices.</li>
          <li><strong>Needs Attention</strong> — items requiring action: new booking requests, estimates awaiting approval, approved estimates ready to invoice, overdue payments.</li>
          <li><strong>RO Pipeline</strong> — count of repair orders in each status (Draft → Closed).</li>
          <li><strong>Recent Activity</strong> — log of recent actions (status changes, estimates sent, invoices updated).</li>
        </ul>
      </>
    ),
  },
  {
    id: "customers",
    icon: "fa-solid fa-users",
    title: "Customers & Vehicles",
    content: (
      <>
        <p><strong>Customers</strong> — search by name, phone, or email. Click <em>New Customer</em> to add one.</p>
        <ul>
          <li>Keep phone and email accurate — estimate approval links are sent to the customer's email on file.</li>
          <li>Service history tab shows every RO, estimate, and invoice for that customer.</li>
        </ul>
        <p><strong>Vehicles</strong> — each vehicle is linked to a customer. Search by make, model, VIN, plate, or customer name.</p>
        <ul>
          <li>You can create a vehicle directly from the Repair Order creation screen — no need to go to Vehicles first.</li>
          <li>Vehicle service history shows all work done on that specific vehicle.</li>
        </ul>
      </>
    ),
  },
  {
    id: "appointments",
    icon: "fa-solid fa-calendar-days",
    title: "Appointments",
    content: (
      <>
        <p>Appointment requests from the public website, phone calls, and walk-ins are managed here.</p>
        <ul>
          <li><strong>Calendar view</strong> (default) — shows requests by submission date. Click an event to see details below the calendar.</li>
          <li><strong>List view</strong> — searchable table with status filter tabs.</li>
          <li><strong>Add Request</strong> — log a phone call or walk-in manually. Web form submissions appear automatically.</li>
        </ul>
        <p><strong>Statuses:</strong> Pending → Confirmed / Cancelled / Converted</p>
        <p><strong>Convert to RO:</strong> Click an appointment → click <em>Convert to RO</em> → select customer and vehicle → create.</p>
      </>
    ),
  },
  {
    id: "repair-orders",
    icon: "fa-solid fa-screwdriver-wrench",
    title: "Repair Orders",
    content: (
      <>
        <p>The Repair Order (RO) is the central record for each vehicle visit. All inspections, estimates, and invoices link to it.</p>
        <p><strong>Creating an RO:</strong></p>
        <ol>
          <li>Click <em>New Repair Order</em></li>
          <li>Select or create the customer and vehicle</li>
          <li>Add each <strong>customer concern</strong> as a separate line (e.g., "Brakes grinding", "Oil change due")</li>
          <li>Enter mileage in and promised date, then save</li>
        </ol>
        <p><strong>Status workflow:</strong></p>
        <div className="helpStatusFlow">
          {["Draft","Active","In Progress","Waiting Approval","Approved","Completed","Invoiced","Closed"].map((s, i, arr) => (
            <span key={s}>
              <span className="helpStatusChip">{s}</span>
              {i < arr.length - 1 && <span className="helpStatusArrow">→</span>}
            </span>
          ))}
        </div>
        <p style={{ marginTop: 8 }}>Use <em>Cancelled</em> for ROs that will not proceed. Never delete records.</p>
      </>
    ),
  },
  {
    id: "ro-print",
    icon: "fa-solid fa-print",
    title: "Internal RO Printout",
    content: (
      <>
        <p>The Internal RO Printout is a paper worksheet for the mechanic. It auto-fills from the RO and has blank sections for hand-written notes.</p>
        <ol>
          <li>Open the Repair Order → click <strong>Print Internal RO</strong></li>
          <li>In the print dialog, <strong>turn off Headers and Footers</strong> for a clean result</li>
          <li>Print or save as PDF → hand to the technician</li>
        </ol>
        <p><strong>What auto-fills:</strong> customer name, vehicle, license plate, VIN, mileage, promised date, and numbered customer concerns.</p>
        <p><strong>Internal notes are not printed</strong> on the customer invoice — they stay staff-only.</p>
      </>
    ),
  },
  {
    id: "inspections",
    icon: "fa-solid fa-clipboard-check",
    title: "Inspections",
    content: (
      <>
        <p>Inspections document the vehicle's condition at the time of service.</p>
        <ol>
          <li>Open the Repair Order → click <strong>Start Inspection</strong></li>
          <li>Add items by category (Brakes, Tires, Lights, Fluids, etc.)</li>
          <li>Set the condition: <strong>Good / Fair / Poor / Critical</strong></li>
          <li>Add notes and photos for items that need explanation</li>
        </ol>
        <p>Items flagged as Poor or Critical are typically added to the estimate as recommended repairs.</p>
      </>
    ),
  },
  {
    id: "estimates",
    icon: "fa-solid fa-file-invoice-dollar",
    title: "Estimates",
    content: (
      <>
        <p>Open an estimate from the Repair Order. Each customer concern automatically becomes a job section.</p>
        <p><strong>Adding line items — click Add Item:</strong></p>
        <table className="helpTable">
          <tbody>
            <tr><td><strong>Labour</strong></td><td>Technician time</td></tr>
            <tr><td><strong>Part</strong></td><td>Parts and components</td></tr>
            <tr><td><strong>Shop Supply</strong></td><td>Consumables and supplies</td></tr>
            <tr><td><strong>Fee</strong></td><td>Shop or disposal fees</td></tr>
            <tr><td><strong>Discount</strong></td><td>Dollar or percent discount</td></tr>
          </tbody>
        </table>
        <ul>
          <li><strong>Required items</strong> — customer cannot decline these</li>
          <li><strong>Optional items</strong> — customer can approve or decline individually</li>
          <li><strong>Customer visible</strong> — uncheck to hide an item from the customer</li>
          <li>Use <strong>Add Preset Job</strong> to insert a saved template instantly</li>
        </ul>
        <p>Check the <strong>Totals Bar</strong> (subtotal / GST / total) before sending. Then click <strong>Send Approval Link</strong>.</p>
      </>
    ),
  },
  {
    id: "pricing",
    icon: "fa-solid fa-tag",
    title: "Pricing & Markup",
    content: (
      <>
        <p>Internal cost and markup are staff-only fields. Customers never see them.</p>
        <table className="helpTable">
          <thead>
            <tr><th>Field</th><th>Who Sees It</th><th>What It Is</th></tr>
          </thead>
          <tbody>
            <tr><td>Internal Cost</td><td>Staff only</td><td>What the shop pays</td></tr>
            <tr><td>Markup</td><td>Staff only</td><td>Amount added on top of cost</td></tr>
            <tr><td>Customer Price</td><td>Customer sees this</td><td>Final price on estimate</td></tr>
          </tbody>
        </table>
        <p><strong>Markup types:</strong></p>
        <ul>
          <li><strong>Percent:</strong> Cost $50 + 25% = Customer Price $62.50</li>
          <li><strong>Fixed $:</strong> Cost $50 + $20 = Customer Price $70.00</li>
        </ul>
        <p>Customer price auto-calculates when you enter cost and markup. You can also override it manually.</p>
        <p className="helpSafetyNote">
          <i className="fa-solid fa-shield-halved"></i>
          Cost and markup never appear on customer approval pages, invoices, emails, or Helcim invoices.
        </p>
      </>
    ),
  },
  {
    id: "presets",
    icon: "fa-solid fa-bolt",
    title: "Presets",
    content: (
      <>
        <p>Presets are reusable job templates (e.g., Oil Change, Brake Service, Diagnostic). Set them up once, use them in any estimate.</p>
        <p><strong>Access Presets:</strong> Click <em>Presets</em> at the bottom of the sidebar (under Setup).</p>
        <p><strong>Creating a preset:</strong></p>
        <ol>
          <li>Click <em>New Preset</em> → enter name and category</li>
          <li>Click <em>Add Item</em> to add line items with pricing</li>
          <li>Save — the preset is now available in the estimate builder</li>
        </ol>
        <p><strong>Using in an estimate:</strong> Click <em>Add Preset Job</em> → browse by category → click <em>Add to Estimate</em>.</p>
        <p>To remove a preset: click <em>Deactivate</em> (not delete). It can be reactivated anytime.</p>
      </>
    ),
  },
  {
    id: "approval",
    icon: "fa-solid fa-paper-plane",
    title: "Customer Approval",
    content: (
      <>
        <p>The approval workflow lets customers review and approve their estimate online — no login required.</p>
        <ol>
          <li>Build the estimate in the portal</li>
          <li>Click <strong>Send Approval Link</strong> → confirm the customer's email → send</li>
          <li>Customer receives an email with a secure link</li>
          <li>Customer approves or declines optional items and submits</li>
          <li>Portal updates — check the estimate for approved/declined items</li>
          <li>Proceed with approved work → create the invoice</li>
        </ol>
        <ul>
          <li>Links expire after <strong>7 days</strong></li>
          <li>Links are <strong>single-use</strong> — once submitted, the customer cannot resubmit</li>
          <li>Customer sees prices only — cost, markup, and internal notes are never visible</li>
        </ul>
      </>
    ),
  },
  {
    id: "invoices",
    icon: "fa-solid fa-receipt",
    title: "Invoices",
    content: (
      <>
        <p>Create invoices from the Repair Order and link them to Helcim for payment.</p>
        <p><strong>Payment statuses:</strong></p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {[
            { label: "Unpaid", cls: "helpBadgeDanger" },
            { label: "Partial", cls: "helpBadgeWarning" },
            { label: "Paid", cls: "helpBadgeSuccess" },
            { label: "Refunded", cls: "helpBadgeNeutral" },
          ].map(({ label, cls }) => (
            <span key={label} className={`helpBadge ${cls}`}>{label}</span>
          ))}
        </div>
        <ul>
          <li>Click <strong>Create in Helcim</strong> to push the invoice to Helcim for payment</li>
          <li>In-person payments via the Helcim terminal sync automatically — no manual update needed</li>
          <li>Use the <em>Sync</em> button if the status has not updated after a few minutes</li>
        </ul>
      </>
    ),
  },
  {
    id: "printing",
    icon: "fa-solid fa-file-pdf",
    title: "Printing / Save as PDF",
    content: (
      <>
        <table className="helpTable">
          <thead>
            <tr><th>Document</th><th>How to Open</th></tr>
          </thead>
          <tbody>
            <tr><td>Internal RO worksheet</td><td>Open RO → Print Internal RO</td></tr>
            <tr><td>Customer invoice</td><td>Open Invoice → Print Invoice</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 10 }}><strong>For a clean printout:</strong> In the browser print dialog, turn off <em>Headers and Footers</em> (sometimes under "More settings"). This removes the browser-generated date and URL from the printout.</p>
        <p>To save as PDF: in the print dialog, choose <em>Save as PDF</em> as the printer.</p>
        <p><strong>Suggested PDF names:</strong></p>
        <ul>
          <li><code>PACE_INV001012</code> — by invoice number</li>
          <li><code>PACE_RO-2026-0029</code> — by RO number</li>
        </ul>
      </>
    ),
  },
  {
    id: "not-to-do",
    icon: "fa-solid fa-triangle-exclamation",
    title: "What Not To Do",
    content: (
      <>
        <table className="helpTable">
          <thead>
            <tr><th>Avoid This</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Sharing the staff login</td>
              <td>If a team member leaves, there is no way to trace actions or lock access</td>
            </tr>
            <tr>
              <td>Putting cost or markup in customer-facing descriptions or notes</td>
              <td>Those fields are visible to customers on their approval page</td>
            </tr>
            <tr>
              <td>Writing card numbers or CVV codes in any note field</td>
              <td>Card data must never be stored — Helcim handles this securely</td>
            </tr>
            <tr>
              <td>Deleting records</td>
              <td>Use Cancelled, Closed, Archived, Deactivated, or Inactive instead — records can be reviewed later</td>
            </tr>
            <tr>
              <td>Forwarding approval links to the wrong person</td>
              <td>Approval links are for the specific customer only</td>
            </tr>
            <tr>
              <td>Using fake names or test data during real operation</td>
              <td>Test records mix with real customer data and are difficult to clean up</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "troubleshooting",
    icon: "fa-solid fa-wrench",
    title: "Troubleshooting",
    content: (
      <>
        <table className="helpTable">
          <thead>
            <tr><th>Problem</th><th>What To Try</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Approval email not received</td>
              <td>Confirm customer email is correct → ask them to check spam → try sending again from the estimate</td>
            </tr>
            <tr>
              <td>Printout shows browser date or URL</td>
              <td>Turn off <em>Headers and Footers</em> in the browser print dialog</td>
            </tr>
            <tr>
              <td>Invoice payment status not updated</td>
              <td>Wait a few minutes for auto-sync → use the Sync button in the invoice panel</td>
            </tr>
            <tr>
              <td>Customer or vehicle missing from a selector</td>
              <td>Create the record in Customers or Vehicles first, then return to the form</td>
            </tr>
            <tr>
              <td>Estimate totals look wrong</td>
              <td>Check item quantities and prices → confirm no items are set to customer-hidden → GST is 5% automatically</td>
            </tr>
            <tr>
              <td>Preset not appearing in the estimate picker</td>
              <td>Go to Presets (sidebar bottom) → check if the preset shows as Inactive → click Reactivate</td>
            </tr>
            <tr>
              <td>Customer cannot open the approval link</td>
              <td>Link may be expired (7 days) or already submitted — check the estimate status, then send a new link if needed</td>
            </tr>
            <tr>
              <td>Page won't load or shows an error</td>
              <td>Refresh the page (F5) → sign out and sign back in → contact your administrator if the problem continues</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
];

/* ── Component ──────────────────────────────────────────────── */
export default function PortalHelp() {
  return (
    <PortalLayout title="Help">
      {/* Page header */}
      <div className="portalPageHeader">
        <div>
          <h2 className="portalPageHeading">Help &amp; Instructions</h2>
          <p className="portalPageDesc">
            Staff reference guide for the P.A.C.E. portal.
          </p>
        </div>
      </div>

      {/* Daily Workflow card */}
      <div className="helpWorkflowCard portalCard">
        <h3 className="helpWorkflowTitle">
          <i className="fa-solid fa-list-check" style={{ marginRight: 8, color: "var(--p-yellow)" }}></i>
          Daily Workflow
        </h3>
        <ol className="helpWorkflowList">
          {WORKFLOW.map((step, i) => (
            <li key={i} className="helpWorkflowItem">
              <span className="helpWorkflowNum">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Accordion sections */}
      <div className="helpAccordion">
        {SECTIONS.map((section) => (
          <details key={section.id} className="helpSection">
            <summary className="helpSectionBtn">
              <span className="helpSectionIcon">
                <i className={section.icon}></i>
              </span>
              {section.title}
              <i className="fa-solid fa-chevron-down helpChevron" aria-hidden="true"></i>
            </summary>
            <div className="helpSectionBody">
              {section.content}
            </div>
          </details>
        ))}
      </div>

      {/* Footer note */}
      <div className="helpFooterNote">
        <i className="fa-solid fa-book" style={{ marginRight: 7, opacity: .6 }}></i>
        For the complete written manual, ask your portal administrator for the
        <strong> OWNER_USER_MANUAL.md</strong> and <strong>OWNER_QUICK_START.md</strong> documents.
      </div>
    </PortalLayout>
  );
}
