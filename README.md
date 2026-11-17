# fastxgloebe

Shipment consignment & tracking website. **No shop, no selling, no checkout** — just consignments.
Design: original professional CSS (2026 standard), living sliders and counters, footer © 2026.

- **Main website** — home, About Us (about, mission and **goals** of the company), services
  (Sea / Air / Road / Warehousing), an NVOCC write-up with Read More, auto-playing picture
  sliders, a slow count-up stats band (**12,000+ Projects Completed · 4,500+ Clients ·
  500+ Employees · 12+ Years of Experience**), a **Where We Ship** section (popular
  non-African routes with a See more toggle — the service delivers to **all countries
  worldwide**), Our Professional Team, and **What People Say** testimonials
- **Track Consignment** — anyone with an `FXG-xxxxxxxx` tracking number sees where the
  goods are now, the full checkpoint timeline, and a **real map (Leaflet + OpenStreetMap)**
  with the pin **placed by the admin** (case-insensitive tracking codes)
- **My Account** — register with a **real email**: a 6-digit verification code is emailed
  to that address and must be entered to finish creating the account. Forgot-password
  works the same way (reset code by email). Profile page: name, phone, address,
  edit profile, change password. Customers see their own consignments, support replies,
  and a **live Chat** with the admin team
- **Contact Support** — support form (logged in or as a guest); messages drop into the
  **Admin Support Inbox Portal**
- **Admin panel** — the **first verified registered account becomes admin automatically**
  (pending/unverified registrations never consume the admin slot). Admin can:
  - **Book a package** — the system **auto-generates the FXG tracking code** and creates
    a **receipt** for the booking with that code on it. Admin fills the receipt
    (sender, receiver, origin, destination, description, weight, pieces, charges, total)
    and opens a clean, screenshot-ready receipt view (print/PDF prints only the receipt)
  - **Update where the goods are** (status + location + note) and **place the map pin**
    on a real map (search a place or tap the map) — customer tracking updates instantly
  - Use the **Customer Chat Portal** (a chat thread per customer) and the
    **Support Inbox Portal** (reply to / close support messages)
  - See stats, all consignments and all registered customers
  - Non-admins are blocked from every admin endpoint (403)

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

No `DATABASE_URL` needed locally — it runs in JSON file dev mode (`data/db.json`, git-ignored).
Locally, email runs in **dev mode** unless you set the Brevo variables below: codes are
printed in the server log and returned in the API response (`dev_code`) so the flow can be
tested. **That is only for local testing — production must run in live mode.**

**Register your own account first** — the first *verified* account on a fresh site becomes the admin.

## Email codes (Brevo) — REQUIRED for production

Registration and password-reset codes must land in customers' **real email inboxes/apps**.
That only happens in live mode:

| Variable | Value |
|---|---|
| `OTP_MODE` | `live` (already set in `render.yaml`) |
| `BREVO_API_KEY` | Your Brevo API key (free tier, `sync: false` — paste it in the Render dashboard, never in code) |
| `BREVO_SENDER_EMAIL` | A sender email verified in Brevo (ideally `info@fastxgloebe.com` once the domain is connected) |

Without live mode, codes are **not emailed** — do not launch publicly until a real
registration test delivers a code to a real inbox.

## Storage

| Mode | When | How it works |
|---|---|---|
| Postgres | `DATABASE_URL` is set (production on Render + Supabase) | Uses the `pg` package; tables auto-create/upgrade on boot; data persists across deploys/restarts |
| JSON file (dev) | No `DATABASE_URL` | Simple JSON file store at `data/db.json`; zero external services; the server logs which mode it is in |

## Contact details in the footer — placeholders to replace

The footer address (**Office 1804, Empire Heights Tower A, Business Bay, Dubai,
United Arab Emirates**) and phone (**+971 4 524 8091**) are **PLACEHOLDERS**
chosen in Dubai as requested. Replace them with the business's real office address and
real phone number before customers rely on them. The email is **info@fastxgloebe.com**.

## Environment variables

| Variable | Required in production | Notes |
|---|---|---|
| `PORT` | Set by Render automatically | Never hardcode a port |
| `DATABASE_URL` | Yes | Supabase Postgres connection string, pasted in the Render dashboard (`sync: false`) |
| `JWT_SECRET` | Yes | Render generates it (`generateValue: true`). Locally a dev fallback is used with a warning — never rely on it in production |
| `OTP_MODE` | Yes | Must be `live` in production |
| `BREVO_API_KEY` | Yes | `sync: false` — dashboard only |
| `BREVO_SENDER_EMAIL` | Yes | Must be a Brevo-verified sender |

## Deploy

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the exact, phone-friendly steps
(GitHub → Supabase → Brevo → Render → custom domain `fastxgloebe.com`).

## Test

```bash
npm run test:e2e   # starts its own server on port 3210 with a throwaway data file
```

Covers: email-code registration (dev mode), wrong code rejected, forgot-password reset,
profile update + change password, booking → auto tracking code + receipt, admin map pin →
public tracking returns the pin, location updates, customer chat → admin reply, support
inbox, admin guards (403/401), and homepage content checks.
