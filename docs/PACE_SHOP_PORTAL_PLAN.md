# P.A.C.E. Shop Portal — Master Plan

## 1. Current Project Overview

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 7 |
| Styling | Custom CSS (`src/index.css`) |
| Hosting | Netlify (static site + serverless functions) |
| Email | Resend API via Netlify Function |
| Domain | powerautomotive.ca |

### Current File Structure
```
pace-site/
├── public/                    # Static assets (images, textures, favicon)
│   ├── pace-logo.png
│   ├── paceshop.png
│   ├── paper.png / paper2.png / grain.png
│   └── vite.svg
├── src/
│   ├── App.jsx                # Main single-page app (public website)
│   ├── index.css              # Global stylesheet
│   ├── main.jsx               # React entry point
│   └── components/
│       ├── Navbar.jsx         # Public site navigation
│       ├── Section.jsx        # Reusable section wrapper
│       ├── BookingForm.jsx    # Public appointment request form
│       └── Footer.jsx         # Public site footer
├── netlify/
│   └── functions/
│       └── send-inquiry.js    # Serverless email handler (Resend)
├── netlify.toml               # Netlify build + dev config
├── index.html                 # HTML entry point
├── package.json
├── vite.config.js
└── docs/                      # Planning documentation (this folder)
```

### Files That Must Not Be Broken
- `src/App.jsx` — Public website, do not restructure
- `src/index.css` — Public site styles, portal styles go in a separate file
- `src/components/BookingForm.jsx` — Live public form connected to Resend
- `netlify/functions/send-inquiry.js` — Live email function
- `netlify.toml` — Routing and build config (changes require care)
- `public/` — Static assets referenced by the live site

### Do Not Edit
- `node_modules/`
- `dist/`
- `.netlify/`

---

## 2. Recommended Future Architecture

### URL Structure
| Path | Purpose | Access |
|---|---|---|
| `/` | Public website (homepage, about, services, contact) | Public |
| `/approve/:token` | Customer approval links (estimates, inspections) | Token-secured, no login |
| `/portal` | Staff portal login page | Public page, redirects if already logged in |
| `/portal/dashboard` | Staff dashboard | Authenticated staff only |
| `/portal/customers` | Customer list and records | Authenticated staff only |
| `/portal/vehicles` | Vehicle records | Authenticated staff only |
| `/portal/appointments` | Appointment requests | Authenticated staff only |
| `/portal/repair-orders` | Repair order management | Authenticated staff only |
| `/portal/inspections/:id` | Digital inspection | Authenticated staff only |
| `/portal/estimates/:id` | Estimate builder | Authenticated staff only |
| `/portal/invoices` | Invoice list + Helcim links | Authenticated staff only |

### Routing Strategy
- Add **React Router v6** to handle `/`, `/portal/*`, and `/approve/:token`
- The current `App.jsx` single-page content moves into a `PublicSite` component
- A new `Portal` component tree handles all `/portal/*` routes
- A `ProtectedRoute` wrapper redirects unauthenticated users to `/portal` (login)
- `netlify.toml` SPA fallback already handles client-side routing

### Backend Strategy
| Concern | Solution |
|---|---|
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (email/password, JWT) |
| Private file storage | Supabase Storage with RLS policies |
| Secure backend actions | Netlify Functions (for things that must not touch the frontend) |
| Email (approval links, notifications) | Resend API (already configured) |
| Payments / Invoicing | Helcim (external, never store card data) |

### Why Supabase
- Managed PostgreSQL with Row Level Security (RLS)
- Built-in auth with JWT tokens, session management, and refresh
- Storage buckets with per-file access policies — perfect for private inspection photos
- Real-time subscriptions available for future dashboard live-updates
- Generous free tier; scales cleanly
- Works well with Netlify Functions for secure server-side operations

---

## 3. MVP Feature Scope

### Phase 1 MVP (Version 1)
The goal of Version 1 is a working, secure internal tool that replaces paper and spreadsheets for core shop workflows.

| Feature | Description |
|---|---|
| **Staff Login** | Single secure shop login (email + password). One account for now. |
| **Dashboard** | Summary of open ROs, pending approvals, today's appointments |
| **Customers** | Create, view, edit customer records with preferred contact method |
| **Vehicles** | Attach vehicles to customers, track year/make/model/VIN/plate |
| **Appointment Requests** | View and manage requests from the public booking form; convert to RO |
| **Repair Orders** | Create and manage repair orders with status tracking |
| **Digital Inspections** | Add inspection items by category, condition rating, notes, and photos |
| **Estimates** | Build estimates with labor and parts line items |
| **Customer Approval Links** | Send secure email link for customers to approve estimates |
| **Inspection Viewer** | Customers view inspection photos via secure token link |
| **Helcim Invoice Link** | Record Helcim invoice ID and payment link against each RO |
| **Payment Status** | Manually track or webhook-update payment status per RO |
| **Activity Log** | Internal log of key actions for accountability |

### Deferred to Future Phases

**Phase 12 — SMS Approval Links (Deferred — pending owner/provider decision):**
- SMS/text approval links (Twilio or similar, CASL-compliant)
- Owners have not confirmed SMS provider or whether they want to invest in SMS notifications
- Do not implement until owner approves

**Phase 13 — Post-MVP Workflow Improvements (owner-requested):**
- New Customer creation flow inside the New Repair Order modal (no page-switching)
- Multiple customer concern entries per repair order (list-style, not one textarea)
- Customer and vehicle service history view (consolidated past ROs, inspections, estimates, invoices)
- Estimate line item cost price, markup percentage, and auto-calculated customer price fields
- Preset / canned jobs for common services (oil change, brake pads, diagnostic fee, etc.)
- Horizontal estimate totals bar at the bottom of the estimate builder
- Staff portal logo upgrade — replace text-only branding with the real P.A.C.E. logo in the sidebar
- Full-width portal layout — portal content uses more available window width on large screens
- Inactivity auto sign-out — portal signs out staff after 10 minutes of no activity with a warning modal
- Sign-in password visibility toggle — eye icon to show/hide password on the login screen

**Longer-term backlog:**
- Multiple staff accounts / role-based permissions
- Automatic Helcim invoice creation via API
- Technician time tracking
- Parts ordering integration
- Customer portal (login-based, not token-based)
- Reporting and analytics dashboard
- Mobile app

---

## 4. Key Design Decisions

### One Login for MVP
Supabase Auth will be set up with a single staff email/password. The `staff_users` table will be ready for multiple accounts and roles, but only one account will be active in V1. Role-based access control (RBAC) is planned in the schema but not enforced until V2.

### Customer Approval Links (Email First)
Approval tokens are single-use UUIDs stored in the database with an expiry. The customer receives an email (via Resend) with a link like:
```
https://powerautomotive.ca/approve/a3f9b2c1-...
```
No login required. The token grants view access to one specific estimate or inspection. Tokens expire after 7 days by default. SMS approval is a planned future addition — the customer record stores preferred contact method to make this transition easier.

### Inspection Photo Privacy
Photos are stored in a **private Supabase Storage bucket**. They are never publicly accessible by URL. Staff access photos via authenticated requests. Customers access photos only via signed URLs generated server-side when they load a valid approval token link. Signed URLs expire after a short window (e.g. 1 hour).

### Helcim Boundary
P.A.C.E.'s database stores only the Helcim invoice ID and payment link URL. All payment processing, card data, and transaction records stay in Helcim. The portal links out to Helcim's hosted payment page or embeds HelcimPay.js for in-person terminal use.
