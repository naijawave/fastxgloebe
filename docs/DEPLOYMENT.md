# Deploying fastxgloebe — exact steps (phone-friendly)

Free tier everywhere except the domain, which the owner buys themselves.
Order matters: **GitHub → Supabase → Brevo → Render → register FIRST → domain.**

---

## Step 1 — Create an empty GitHub repo

1. Open **github.com** and log in.
2. Tap **+ → New repository**.
3. Repository name: **fastxgloebe**
4. Leave it **Public**, do **NOT** tick "Add a README" (the code already has one).
5. Tap **Create repository**. Its address will look like
   `https://github.com/<your-username>/fastxgloebe`

## Step 2 — Push the code

Done together with the site owner from a computer / with Muse's help:

```bash
cd fastxgloebe
git init
git add .
git commit -m "fastxgloebe shipment consignment website"
git branch -M main
git remote add origin https://github.com/<your-username>/fastxgloebe.git
git push -u origin main
```

> A GitHub personal access token (PAT) may be asked for as the password.
> Use it once for the push and delete / revoke it afterwards. Never put it in the code.

## Step 3 — Create a free Supabase project (the database)

1. Open **supabase.com** → **Start your project** → sign in with GitHub.
2. Tap **New project**.
3. Name: **fastxgloebe** · generate a database password and **save it in your Notes app** · Region: pick the closest EU region.
4. Tap **Create new project** and wait about 2 minutes.
5. In the project, tap **Connect** (top bar) → **Connection string → URI**.
6. Copy the full string that starts with `postgresql://...`
   That is your `DATABASE_URL`. Keep it private — do not paste it in chat or in code.

## Step 4 — Create a free Brevo account (email codes)

Registration and forgot-password codes are emailed to customers' **real inboxes**.
Without this step the codes cannot be delivered — do not skip it.

1. Open **brevo.com** → **Sign up free** (free tier is enough to start).
2. Verify your account email.
3. In Brevo: **Settings → Senders & IP** (or *Senders*) → add and verify the sender
   address you will send from — ideally **info@fastxgloebe.com** once the domain's
   DNS is set up; until then, verify the email address you signed up with.
4. In Brevo: **Settings → API keys → Generate a new API key**. Name it `fastxgloebe`,
   copy the key and keep it private — you will paste it into Render in the next step,
   never into code or chat.

## Step 5 — Render Blueprint deploy

1. Open **render.com** → log in with GitHub.
2. Tap **New → Blueprint**.
3. Pick the **fastxgloebe** repo. Render reads `render.yaml` automatically
   (Node 24, `npm install`, `npm start`, free plan, `JWT_SECRET` auto-generated,
   `OTP_MODE=live`).
4. When asked (they are marked `sync: false`, so Render asks you for them):
   - **`DATABASE_URL`** → paste the Supabase URI from Step 3.
   - **`BREVO_API_KEY`** → paste the Brevo key from Step 4.
   - **`BREVO_SENDER_EMAIL`** → the sender address you verified in Step 4.
5. Tap **Apply / Create**. Wait for the build to finish and the status to show **Live**.
6. Your public link will look like: `https://fastxgloebe.onrender.com`

> Note: on the free tier the site may sleep after inactivity and take
> ~30–60 seconds to wake on the first visit. That is normal for free Render.

## Step 6 — Register FIRST, before sharing the link

1. Open your new public link.
2. Go to **My Account → Register** and register **your own** account first.
   You will get a 6-digit code in your email — enter it to finish.
   **The first verified account on the live site becomes the admin.**
   (This is also your live email test: if the code does not arrive in your real
   inbox, check the Brevo variables in Render → Environment before going further.)
3. Confirm you can see the **Admin** panel in the menu.
4. Only **after** that, share the link with customers.

## Step 7 — Connect your .com domain (fastxgloebe.com)

The owner is buying **fastxgloebe.com** themselves.

1. Buy the domain at your registrar of choice (do not change anything else yet).
2. In Render: open the **fastxgloebe** service → **Settings → Custom Domains →
   Add Custom Domain** → enter `fastxgloebe.com` (and add `www.fastxgloebe.com` too).
3. Render shows you DNS records (a CNAME for `www`, and an A/ALIAS record for the root).
   Add exactly those records in your registrar's DNS page.
4. Wait for DNS to verify in Render (can take from minutes to a few hours).
   Render issues the HTTPS certificate automatically.
5. Afterwards, verify **info@fastxgloebe.com** as the Brevo sender (Step 4) so
   email codes come from your own domain, and update `BREVO_SENDER_EMAIL` in Render.

## After deploy — how daily use works

- **New shipment:** Admin → *Book a package* with the customer's email → the site
  **generates the FXG tracking code automatically** and creates a **receipt** —
  open it with the **Receipt** button on the consignment, fill the charges/total,
  then Print/Save it or screenshot the receipt card. Give the customer the tracking code.
- **Goods moved:** Admin → find the consignment → set the new status + location name,
  **place the pin on the admin map** (search the place, or tap/drag the pin) →
  *Update goods location* → the customer's tracking page and map update instantly.
- **Customer chat:** customers write from **My Account → Chat with us**; you reply in
  Admin → **Customer Chat Portal**.
- **Support:** customers use *Contact Support*; their messages drop into
  Admin → **Support Inbox Portal**, where you reply or close them.
- **Footer contact details:** the Dubai address and +971 phone in the footer are
  placeholders — replace them in `public/index.html` with the real office address
  and real business number as soon as you have them.
