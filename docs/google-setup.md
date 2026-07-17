# Google setup — Calendar + Drive backup (one-time, ~10 minutes)

The Google layer is fully client-side (GIS token model): tokens live only on
Jo's device, no server secret exists, and the only third party contacted is
Google — within Gate B scope. The same connection powers **cloud backup to
Jo's own Google Drive** (hidden app folder — the app can only see the one file
it creates there).

## Create the OAuth client (whoever hosts does this once)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a
   project (e.g. `jo-planner`).
2. **APIs & Services → Library** → enable **Google Calendar API**,
   **Google Drive API** (Drive auto-backup), AND **Google Tasks API**
   (imports her Tasks as To-Do items).
3. **APIs & Services → OAuth consent screen** → External → fill the app name +
   your email. Keep **Publishing status: Testing** and add Jo's Google account
   under **Test users** (this is the plan's "you host for Jo" simplest mode —
   no verification review needed).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application**. Add your origins to *Authorized JavaScript
   origins*: `http://localhost:3000` and your production URL
   (e.g. `https://jo-planner.vercel.app`).
5. Copy the client ID into `.env.local`:
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com`

## Scopes used

- `https://www.googleapis.com/auth/calendar.events` — read + create events
  (needed for the attendee-invite flow). For strict import-only, change
  `GOOGLE_SCOPE` in `src/lib/google/auth.ts` to `.../calendar.events.readonly`
  and remove the "Create in Google" form.
- `https://www.googleapis.com/auth/calendar.readonly` — lists her calendars so
  appointments on secondary calendars import too (without it only "primary"
  was read — the missing-appointments bug).
- `https://www.googleapis.com/auth/tasks.readonly` — imports Google Tasks with
  due dates as To-Do items.
- `https://www.googleapis.com/auth/drive.appdata` — the hidden per-app Drive
  folder for automatic backups. This scope cannot see any of Jo's real Drive
  files.

**After any scope addition**: the next **Connect & sync now** shows Google's
consent screen again with the new checkboxes — approve once. If the sync
status shows a ⚠ warning about reconnecting, that's the cue.

## How Drive auto-backup behaves

While the app is open with Google connected, it silently uploads a full backup
(ink, notes, images, habits) to her Drive app folder every few minutes of
activity and whenever the app is hidden/closed. A fresh install never
auto-uploads (so a new device can't clobber a good backup before restore).
Manual buttons live in ⚙ → Backup: **Back up to Drive now** and **Restore
from Drive…** (restore merges — never deletes newer local work).

## Manual verification script (the Phase 5 verify items needing a live account)

1. `npm run dev` → ⚙ → **Connect & sync now** → Google popup → approve.
2. Confirm imported events appear on the right week/month days; a weekly
   repeating event shows on every instance day (Google pre-expands RRULEs).
3. Create an event with a date+time and an attendee email → confirm the
   attendee receives an invite and the event appears in Google Calendar with a
   30-minute popup reminder.
4. Press **Connect & sync now** twice more → the imported count shows
   "0 new, N refreshed" — no duplicates.
5. Birthdays from Google Contacts appear with 🎂 on the correct day cells.
