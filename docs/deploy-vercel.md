# Deploying Jo's Planner to Vercel (+ Google + install on the Surface Pro)

The whole flow is ~30 minutes. Order matters: deploy first (you need the
production URL before you can finish the Google OAuth client).

## Step 1 — Deploy to Vercel (5 min)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   `jpetree331/custom-windows-surface-pro-calendar-app`.
2. Framework preset auto-detects **Next.js**. No environment variables are
   needed yet — the app is fully functional local-first without any.
3. Deploy. Note the URL (e.g. `https://custom-windows-surface-pro-calendar-app.vercel.app`).
   Optionally rename the project first (Project Settings → name) to get a
   friendlier URL like `jo-planner.vercel.app`.

**Important for Jo**: her planner data lives in the browser's IndexedDB *on her
device* (that's the local-first design). Redeployments never touch her data.
She should always use the same browser profile (Edge) on the Surface.

## Step 2 — Google OAuth client in testing mode (10 min)

Exactly as the plan's Gate B "you host for Jo" mode — **keep the OAuth app in
Testing** so Google never requires a verification review:

1. [console.cloud.google.com](https://console.cloud.google.com) → New project
   (name: `jo-planner`).
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → app name
   `Jo's Planner`, your email for both contact fields → Save.
   - **Audience / Publishing status: leave in "Testing"** — do NOT publish.
   - **Test users → + Add users** → add **Jo's Google account email**
     (and your own for testing). This is the step that prevents the
     "access blocked" screen. Testing-mode tokens work indefinitely for
     the token-model flow this app uses.
4. **Credentials → + Create credentials → OAuth client ID** → type
   **Web application**, name `jo-planner-web`.
   - **Authorized JavaScript origins** — add BOTH:
     - `http://localhost:3000` (your dev machine)
     - `https://<your-project>.vercel.app` (from Step 1)
   - No redirect URIs needed (the GIS token model doesn't use them).
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## Step 3 — Wire the client id into Vercel (2 min)

1. Vercel → Project → **Settings → Environment Variables**:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the client id from Step 2.
2. **Redeploy** (Deployments → ⋯ → Redeploy) — `NEXT_PUBLIC_*` vars are baked
   in at build time, so a redeploy is required.

## Step 4 — Verify Google on the deployed app (5 min)

Open the production URL signed into a **test-user** Google account:
⚙ → **Connect & sync now** → Google popup ("app isn't verified" does NOT
appear for allow-listed test users; a plain consent screen does) → approve →
events/birthdays appear on the right days. Run the 5-step script in
[google-setup.md](google-setup.md) for the full pass.

## Step 5 — Install as an app on Jo's Surface Pro (2 min)

In **Edge** on the Surface:
1. Open the production URL → sign-in not required (local-first).
2. **⋯ menu → Apps → Install this site as an app** (or the install icon in the
   address bar).
3. Pin it to the taskbar. It launches in its own window, works offline, and
   pen + clipboard paste work natively.

## Gotchas

- **Don't publish the OAuth app to production** — that triggers Google's
  verification review (weeks, questionnaires). Testing + allow-listed users is
  the right mode for a personal app.
- If Jo changes browsers or resets Edge, her planner data (IndexedDB) does not
  follow automatically — that's what the (currently stubbed) Supabase sync is
  for. Until sync ships, an occasional **⬇ Year PDF** export is her backup.
- Vercel's URL must be listed in *Authorized JavaScript origins* exactly
  (https, no trailing slash) or the Google popup will error with
  `origin_mismatch`.
