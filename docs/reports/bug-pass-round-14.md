# Bug pass round 14 — pre-emptive sweep (no Jo list this time)

*Date: 2026-09-01 · Requested by Jess: read every report, re-check the old
fixes, hunt for what Jo hasn't reported yet, break nothing.*

Baseline before touching anything: 115/115 tests, typecheck clean, all
round 9–13 fixes present in the code as described in their reports. Each
fix below is its own commit so any one can be reverted on its own.

## Bugs found and fixed

**A pasted text box could kill every PDF download, silently.**
pdf-lib's Helvetica throws on a carriage return, tab, DEL or a C1 control
byte — and text pasted from another Windows program (Notepad, a browser)
arrives with CRLF line endings, which the paste path stored as-is. From
then on every ⬇ PDF (page, range or year that included the box) rejected,
and the toolbar swallowed the rejection: the button simply did nothing.
`safe()` now normalizes CRLF, turns tabs into spaces and drops the bytes
WinAnsi cannot encode (newlines survive), and a failed export shows its
reason in an alert. Same commit: a one-page export read *every* stroke and
image blob in the database (a year of ink plus every note's pictures);
it now reads only the pages being exported. And images pdf-lib can't
embed (GIF, WebP, BMP screenshots) are rasterized to PNG in the browser
instead of vanishing from the page.

**Round 13 never reached a resumed app.** Round 12's "reload on new
deploy" depended on the service worker's bytes changing, i.e. a hand-bumped
cache name in `public/sw.js`. Round 13 shipped without the bump. An
installed planner that Jo resumes rather than relaunches could keep running
round 12 code until she happened to close it. `sw.js` is now served by
`src/app/sw.js/route.ts` (prerendered at build time) with the build id
baked in — Vercel's commit sha, or the build timestamp — so every deploy
changes its bytes; the cache is named per build so the old one is swept on
activate; and PwaRegister listens for `controllerchange` (which can't miss
an install that started before the registration promise resolved), ignoring
only the very first claim so a fresh install never reloads itself. No more
manual bump, ever.

**Restore could roll back recent work.** The Backup panel says "newer local
work was kept", and data-safety.md promises restore "never erases newer
rows" — but restore was a plain upsert by id. Restoring a Drive backup (up
to five minutes stale) overwrote a text box edited since, a renamed note,
a retitled page, a done-checkmark. Tables that carry `updatedAt`
(planners, pages, blocks, events, notes) now keep the local row when it is
strictly newer; ink and habit checks (no timestamp) upsert as before. The
panel reports how many newer rows it left alone. Also found while there:
restoring a backup taken before a page was deleted brought that page back
with an index another page now occupied — pages are renumbered 0…n-1 per
planner after every restore — and cached stroke outlines are cleared so a
stroke restored to an old spot never draws from its stale outline.

**New habits and categories landed mid-list after any delete.** Both used
the row count as the new order, which collides with an existing order once
anything has been deleted (the sidebar buttons had exactly this bug in round
13). Now max order + 1.

**The sync queue grew forever.** One row per pen stroke, never pruned,
because the Supabase mirror it was written for never shipped and the queue
only serves as the Drive auto-backup's dirty flag. After a successful
upload the rows the backup captured are deleted; the newest row stays so
the fresh-install guard ("never auto-upload from an empty device") keeps
working.

**"Today" froze overnight.** The TODAY outline, the past-event fade and
reminder expiry all read the clock at render time, so a tablet left open
past midnight kept yesterday marked until something re-rendered the page.
Today's date now lives in the planner context, refreshed by a timer at
local midnight and again on resume (browsers throttle timers in a hidden
tab); every reader takes it from there.

**Smaller**
- The year ▾ menu sat at z 50 and disappeared behind a note window parked
  top-right; it's in the 3000+ popover band now, like every other menu.
- Dragging a ⬚ selection past a page edge clamped the box but moved the
  contents by the raw drag, leaving the dashed box off what it selected.
  The box is clamped first and the contents follow by exactly that amount.
- "→ Next week" on a task could land on a *duplicated* week page (copies
  keep their dates); it now targets the original next week.

## Review round (3 agents)

Correctness: nothing found. Simplicity: the max+1 order logic was
copy-pasted between habits and categories (now one `nextOrder` helper),
WeekPage re-typed `DAY_ABBR` as a local constant, and a `pasteSelectionCentered`
helper in PlannerShell had been dead since round 11 — all cleaned up.

Conventions: **restore never marked the database dirty**, so the Drive
auto-backup could skip everything a restore brought in until Jo happened to
write something. Chasing that exposed a **round-13 regression in the
fresh-install guard**: seeding the first planner now queues rows (r13's
"mark the database dirty" review fix), so the guard "nothing was ever
written on this device → never auto-upload" no longer holds on a new
device. A new Surface that connected Google (say, to import the calendar)
*before* restoring from Drive could have had its empty planner uploaded
over the real backup within five minutes. Now: a device that has never
uploaded must also hold at least one stroke, text box or note before the
silent backup runs, and a restore queues one dirty marker per table it
touched. Both covered by tests.

## Old reports re-checked

Every change described in rounds 1, 2, 9, 10, 11, 12 and 13 is still in
the code and behaves as documented (moon purge on launch + both sides of
import, notices in the REMINDERS panel, done-checkoffs, reminder expiry,
calendar-scoped deletion, the clipboard recency rule, corner chips with
category colors, sidebar renumbering, rollover with repointed buttons).
Only the round-12 self-update promise was found broken, by omission, as
above.

## Observations not changed (for Jess)

- The Drive auto-backup only runs on a *cached* Google token, which lasts
  about an hour; with auto-sync off, backups quietly stop an hour into a
  session until the next manual sync or connect. Auto-sync's silent refresh
  keeps the token warm, so enabling any auto-sync interval also keeps the
  backup alive. Worth a follow-up (a silent refresh before the backup),
  but it involves Google's popup behavior, which can't be exercised here.
- Ctrl+X with the caret parked (nothing highlighted) inside a text box cuts
  the whole box, by the round-12 passthrough rule. Undo restores it.
- Text pasted from outside always lands at the same spot on the page;
  repeated pastes stack exactly on top of each other.

## Verification

124 tests (9 new: CRLF/tab/control-byte export, newer-local-row survival,
newer-backup-row replacement, page renumbering after a restore, habit and
category order after a delete, queue pruning after upload, carry-forward
past a page copy, restore marks the queue dirty, empty new install never
uploads). Typecheck and production build clean.

Live, in a production build (`next build` + `next start`, port 3100):
`/sw.js` prerendered as a static route, registered at scope `/`, activated
and controlling the page, cache named `jotter-<build id>`, response headers
`application/javascript` + `no-cache`; the app landed on the week of Aug 31
with Tuesday the 1st outlined as today and the 🌗 glyph top-right on Friday;
a text box containing `milk\r\neggs\tbutter\r` written straight into
IndexedDB exported as a page PDF with no error and a download of
`jo-s-planner-page.pdf`; the year menu opened at z 3000.

Not verifiable here: an actual second deploy taking over a resumed app
(needs two builds and a real resume — the mechanism is the browser's
standard skipWaiting/claim/controllerchange sequence), and real midnight.

## Nothing was pushed

All nine commits sit on local `main` ahead of `origin/main` (a590455).
Pushing redeploys both planners; that call is Jess's.
