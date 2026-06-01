# P.A.C.E. — Deployment Guide

## Project Structure

```
pace-site/
├── index.html
├── package.json
├── vite.config.js
├── netlify.toml
├── .env.example              ← copy to .env for local dev
├── public/                   ← your static assets (copy from uploads)
│   ├── pace-logo.png
│   ├── pace-logo-wide.png
│   ├── paper.png
│   ├── paper2.png
│   ├── grain.png
│   └── vite.svg
├── src/
│   ├── main.jsx
│   ├── index.css
│   ├── App.jsx
│   └── components/
│       ├── Navbar.jsx
│       ├── Section.jsx
│       ├── Footer.jsx
│       └── BookingForm.jsx
└── netlify/
    └── functions/
        └── send-inquiry.js   ← serverless email function
```

---

## 1 · Set Up Resend (Email Service)

Resend is free for up to 3,000 emails/month — perfect for a small business.

1. Sign up at **https://resend.com** (free account)
2. Go to **Domains** → Add your domain (e.g. `powerautomotive.ca`)
3. Add the DNS TXT/MX records Resend gives you to your domain registrar
4. Wait for domain verification (usually 5–30 minutes)
5. Go to **API Keys** → Create a new key → copy it

You'll need:
- `RESEND_API_KEY` — the key you just copied
- `FROM_EMAIL` — must be from your verified domain, e.g. `noreply@powerautomotive.ca`
- `BUSINESS_EMAIL` — where appointment notifications go, e.g. `admin@powerautomotive.ca`

> **If you can't verify a domain right now:** Resend also lets you send from `onboarding@resend.dev` on the free tier for testing. Use that as `FROM_EMAIL` temporarily.

---

## 2 · Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env example and fill in your values
cp .env.example .env
# Edit .env with your RESEND_API_KEY, BUSINESS_EMAIL, FROM_EMAIL, FROM_NAME

# 3. Start development server (includes Netlify Functions)
npm run dev
# Opens at http://localhost:8888
# Netlify Functions available at /.netlify/functions/send-inquiry
```

The `npm run dev` command uses **netlify dev** which:
- Runs your Vite dev server
- Starts the serverless functions locally
- Loads environment variables from `.env` automatically

To run Vite only (no function testing): `npm run dev:vite`

### Testing the Form Locally

1. Fill out the form at `http://localhost:8888/#contact`
2. Submit — check the terminal for function logs
3. Check your `BUSINESS_EMAIL` inbox for the notification
4. Check the email address you typed in the form for the confirmation

---

## 3 · Deploy to Netlify

### Option A: Netlify CLI (fastest)

```bash
# Install Netlify CLI globally if you haven't
npm install -g netlify-cli

# Login
netlify login

# Create a new Netlify site from this project
netlify init

# Add environment variables
netlify env:set RESEND_API_KEY    "re_xxxxxxxxxxxx"
netlify env:set BUSINESS_EMAIL   "admin@powerautomotive.ca"
netlify env:set FROM_EMAIL       "noreply@powerautomotive.ca"
netlify env:set FROM_NAME        "P.A.C.E. Auto Repair"

# Build and deploy
netlify deploy --build --prod
```

### Option B: Netlify Dashboard (drag-and-drop)

1. Run `npm run build` locally
2. Go to **https://app.netlify.com** → New site → Drag and drop the `dist` folder
3. After deploy, go to **Site settings → Environment variables** and add all 4 vars above
4. Re-deploy from the dashboard or push to git

### Option C: Git-connected Deploy (recommended for ongoing updates)

1. Push your project to a GitHub/GitLab repo
2. Go to **https://app.netlify.com** → New site → Connect to Git
3. Select your repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
5. Go to **Site settings → Environment variables** → add all 4 vars
6. Trigger a deploy

Every `git push` to your main branch will auto-deploy.

---

## 4 · Environment Variables Reference

| Variable        | Required | Example                          | Notes                                      |
|-----------------|----------|----------------------------------|--------------------------------------------|
| RESEND_API_KEY  | ✅ Yes   | `re_abc123...`                   | From resend.com → API Keys                 |
| BUSINESS_EMAIL  | ✅ Yes   | `admin@powerautomotive.ca`       | Where you receive appointment notifications |
| FROM_EMAIL      | ✅ Yes   | `noreply@powerautomotive.ca`     | Must be on your verified Resend domain     |
| FROM_NAME       | Optional | `P.A.C.E. Auto Repair`           | Defaults to "P.A.C.E. Website"             |

---

## 5 · Public Image Assets

Copy these files into the `public/` folder of your project:

```
public/
  pace-logo.png       ← main vintage badge logo
  pace-logo-wide.png  ← wide version (optional)
  paper.png           ← base body texture
  paper2.png          ← card/panel texture
  grain.png           ← subtle grain overlay
  vite.svg            ← favicon (replace with pace icon if desired)
```

These are referenced in CSS as `/paper.png`, `/grain.png`, etc.
**Do not use `/public/paper.png`** — Vite strips the `/public` prefix at build time.

---

## 6 · Adding a Shop Photo

In `App.jsx`, find the `posterPhoto` div:

```jsx
<div className="posterPhoto" aria-label="Shop photo coming soon">
  <span className="posterPhotoLabel">Your Shop Photo Here</span>
  <span className="posterPhotoSub">Proud of every bay</span>
</div>
```

Replace with:

```jsx
<div className="posterPhoto">
  <img src="/shop-photo.jpg" alt="P.A.C.E. auto repair shop interior" />
</div>
```

And add `.posterPhoto img { width:100%; height:100%; object-fit:cover; border-radius:inherit; }` to `index.css`.

---

## 7 · Custom Domain

In Netlify: **Site settings → Domain management → Add custom domain**.
Point your DNS to Netlify's servers (or use Netlify DNS).
Free SSL is provisioned automatically.

---

## 8 · Spam Protection

The form includes:
- Client-side required field validation
- Server-side validation (name, phone, email, consent)
- Consent checkbox (legal + spam deterrent)
- Email format validation on both client and server

For additional spam protection, consider adding **Netlify's built-in spam filtering** (free) or **hCaptcha** to the form.
