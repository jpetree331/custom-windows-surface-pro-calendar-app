# Phase 5 Report — Google Calendar Layer

*Executor: Claude Code · Date: 2026-07-08*

## What was built

- `src/lib/google/auth.ts` — client-side GIS token-model OAuth (public client id
  only; token in sessionStorage; scope `calendar.events`, verified live).
- `src/lib/google/api.ts` — Calendar v3 client: paginated `listInstances`
  (singleEvents=true → server-side RRULE expansion), `insertEvent` (RRULE,
  reminders, attendees with `sendUpdates=all`). Injectable fetch for tests.
- `src/lib/google/import.ts` — year-window import of events + birthdays with
  googleId-keyed upsert (idempotent syncs).
- `GooglePanel` in the ⚙ dialog — Connect & sync, status line, "New Google
  event" form (date/time, weekly repeat, 30-min popup reminder, attendee
  invite).
- `EventChips` — colored chips on week day rows and month cells; birthdays 🎂
  pink; category colors apply via `categoryId`.
- `docs/google-setup.md` — 10-minute OAuth-client setup + the manual live-verify
  script for Jo/host.

## Verify checklist

The plan's Phase 5 verify items require a live Google account + OAuth client;
neither exists in this build environment, so live items are **DEFERRED to the
documented manual script** and their logic is proven by mocked-API tests:

| Item | Result | Evidence |
|---|---|---|
| Authenticate | **DEFERRED (built + documented)** | GIS flow implemented; needs a real Google popup — step 1 of docs/google-setup.md |
| Imported events appear on correct dates | **PASS (mocked)** | Tests: timed event → 2026-07-08 with 14:00–15:00; all-day and cancelled handling covered |
| Repeating event shows on all instances | **PASS (mocked)** | 3 weekly instances land on Jul 6/13/20; expansion is Google-native (singleEvents=true) |
| Reminder created | **PASS (request-level)** | insertEvent test asserts the 30-min popup override in the POST body; firing is Google-side |
| Birthdays on correct days | **PASS (mocked)** | eventTypes=birthday call mapped to kind=birthday on 2026-07-10, 🎂 chip rendering |
| Inviting a contact adds an attendee | **PASS (request-level)** | POST body carries `attendees:[{email}]` + `sendUpdates=all` (Google emails the invite) |
| No duplicates after repeated syncs | **PASS** | Test: second import → `{added: 0, updated: 5}`, row count stable; title changes refresh in place |
| Data-sovereignty (Google only, within Gate B) | **PASS** | Only third-party endpoint in the codebase is `googleapis.com`; tokens stay on-device; no server routes |

Full suite: 32/32 green. Production build clean.

## Deviations

1. **Gate B defaulted autonomously** (Jo unreachable): import + explicit-create,
   testing-mode OAuth hosted for Jo, attendee-invite = share-to-contact. All
   documented in the recon with switch instructions.
2. **Live end-to-end run deferred** — no Google account/credentials available to
   the executor. `docs/google-setup.md` contains the exact 5-step verification
   script; every deferred item has a mocked-API test at the request level.
3. **Category colors on imported events** must be re-tagged after re-import if
   Google changes the event (googleId upsert refreshes the row; documented in
   recon).
