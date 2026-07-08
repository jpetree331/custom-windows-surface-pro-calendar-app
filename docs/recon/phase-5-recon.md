# Phase 5 Recon — Google Calendar Layer

## Gate B resolution (autonomous defaults — flagged for Jo's confirmation)

| Question | Default chosen | Rationale / to change |
|---|---|---|
| Import-only vs two-way | **Import + explicit create** (imports never write back; the only writes are events Jo explicitly creates in the "New Google event" form) | Safest against sync bugs; full two-way would need conflict handling. Narrow to strict import-only by switching the scope to `calendar.events.readonly` |
| Hosting / OAuth mode | **You host for Jo**: OAuth consent screen in *Testing* mode with Jo allow-listed (plan's "simplest" option); fully client-side GIS token model, no client secret anywhere | `docs/google-setup.md` walks through it |
| "Share to Google Contacts" | Confirmed reading: **invite a contact as an event attendee** — `insertEvent` posts `attendees[]` with `sendUpdates=all` so Google emails the invite | |

## Auth flow

GIS token model (`accounts.google.com/gsi/client` → `initTokenClient`): popup
consent on first use, access token cached in sessionStorage (~1h), silent
re-prompt afterwards. Tokens never leave the device; no server routes exist.
Scope names + endpoints verified live against Google's docs on 2026-07-08.

## Sync direction & conflict strategy

- **Pull**: `events.list` with `singleEvents=true` (Google expands RRULEs
  server-side — native repeat handling, zero local recurrence math), windowed to
  the planner year ± edge weeks, `eventTypes` default+fromGmail plus a second
  call for `birthday`.
- **Dedup**: upsert keyed on `googleId` (the instance id); repeated syncs
  refresh titles/times in place — never duplicate. Google is the source of
  truth for imported events (last-import-wins); local-only fields (categoryId)
  live on the local row and survive refreshes only if re-applied after import
  (documented limitation).
- **Reminders**: surfaced via Google (created events attach a 30-min popup
  override; Google fires the notification).

## Rendering

`EventChips` (liveQuery per day cell): color = event's category else blue
(birthday pink + 🎂), time prefix on week rows, compact mode on month cells,
overflow "+N more".
