# Feedback round 12 (Jo) — 9 items

## The moon phases, third attempt — and why the first two failed

Rounds 10 and 11 each shipped a fix that was *correct in isolation* and still
didn't clear Jo's chips. The investigation this round found the reason the
earlier fixes couldn't win:

1. **The import re-added them moments after purging.** `importYear` purged at
   the start, then fetched and upserted — so if that calendar was still being
   requested, every sync deleted the chips and immediately put them back. This
   alone explains "synced multiple times, nothing changed."
2. **Two ways it was still being requested.** Unsubscribing in Google usually
   means unchecking visibility, which leaves the calendar on the account; and
   the app keeps its *own* per-planner calendar checklist, which still had the
   calendar ticked. Neither was reconciled with the other.
3. **The matcher was too literal.** It demanded an exact phrase, so
   "Full Moon 3:12 AM", "Full Moon (Wolf Moon)", a non-breaking space, or any
   daily-phase name ("Waxing Gibbous") slipped straight through.
4. **She may not even have been running the fixes.** The service worker used a
   fixed cache name and never reloaded on update, so an installed PWA that is
   resumed rather than relaunched could keep serving an old bundle forever.

### What shipped, layered so no single guess has to be right
- Imported rows now record **which Google calendar they came from**
  (`PlannerEvent.calendarId`), and unchecking a calendar in Settings
  **deletes its items**.
- The purge runs **again after** the upsert, not only before.
- Calendars that vanish from the account are **dropped from the checklist**.
- The matcher normalizes titles (parentheticals, clock times, percentages,
  emoji, non-breaking spaces) and covers all eight phase names — while still
  refusing to touch "Full Moon party" (tested both ways).
- Settings gains **"Remove imported items by name"**: type a word (default
  "moon"), press Find, see what it matched, press Delete. Works no matter how
  that calendar names its events, and shows Jo exactly what will go.
- The purge can no longer die silently (try/catch + a recorded result), runs
  at launch, and runs after a **backup restore**.
- Service worker cache is versioned and the app **reloads itself when a new
  version is deployed**.

## The rest
- **Sidebar ＋** sits under the last jump button, above Notes; it opens the
  button editor in a popover (extracted to `SideButtonEditor`, shared with
  Settings) so she never needs Settings for this.
- **Page titles are editable in place** — double-tap the chip on any
  end-of-year or added page; the chip re-hugs the text as she types, and her
  capitalization is kept (`renamePage`/`addBlankPage` no longer uppercase).
- **Reminders expire**: not generated for events that have passed, and hidden
  at render so they disappear on the day without waiting for a sync.
- **Cut/paste between pages and notes**, both directions: area-selection
  pastes now target the focused note, and notes gained a right-click
  **"Paste here"**.
- **Selection tools work in notes** — the overlay simply was never mounted
  there; a marquee selected things invisibly.
- **Rotation** no longer resizes her writing: a note is now a **fixed canvas**
  (`Note.pageW`) that the window looks at, anchored top-left. Rotating changes
  how much is visible, not the size; she resizes the window as she wants.
  Bonus: notes regained a true PAGE_W × PAGE_H space, so the shared
  selection/paste clamps are correct inside notes for the first time.
- **Month pages** show no reminder chips.
- **Birthday leads removed** — Jo's own Google notifications were doubling
  with the app's invented 1wk/2wk chips.

## Bugs found while building (not on her list)
- **Ctrl+C/X were dead inside notes.** A note opens with its body text box
  focused (r11), and the global hotkey guard treats focus-in-a-text-box as
  "typing" — so a marquee selection made in a note could not be copied at all.
  Copy/cut may now proceed when something is selected in the app and no actual
  text is highlighted; paste stays hands-off so a real text paste is never
  hijacked (hence the note's right-click Paste).
- **Tests depended on the wall clock.** Reminder-expiry made three suites
  fail simply because real time had passed the 2026-07 fixtures. "Today" is
  now injectable and pinned in tests.

## Review round (3 agents, 7 findings, all fixed)
- **Critical:** the new copy/cut passthrough used `window.getSelection()`,
  which can't see a highlight inside a native `<input>` — so highlighting text
  in a note title while a block happened to be selected would have **cut the
  block instead**, silently. Passthrough is now restricted to contenteditable
  focus and never applies in form fields.
- A note could adopt its canvas width from React's placeholder 1024×768
  viewport before the real size was measured, permanently baking in a wrong
  writing size. The viewport hook now initializes from the real window.
- Auto-reloading on a service-worker update could discard un-blurred text
  (everything here commits on blur). The reload now waits until nothing is
  being edited, or until she switches away from the app.
- "Unchecking a calendar removes its items" was untrue for rows imported
  before this round (they carry no calendar tag) — copy corrected, with a
  pointer to the by-name cleanup and a note that one sync re-tags them.
- Month-page PDFs still printed the reminder chips this round removes from
  the screen; now suppressed, and the stale parity comment corrected.
- Redundant matcher branch, a stale comment naming a deleted component, and
  duplicated "paste selection-or-item" logic (now one shared helper).
- Added a two-step confirm to the by-name cleanup: a name search legitimately
  matches real events ("Full Moon party"), and event deletes aren't undoable.

## Verification
104 tests (new: title-matcher table covering the formats the old matcher
missed plus "Full Moon party" protection, calendar-scoped and name-based
deletion, no-birthday-leads, past-event skip). Typecheck + build clean.
Live: ＋ button placement and editor popover; title double-tap → edit →
capitalization kept → chip grew → persisted → restored; note canvas held its
width, font size and content position across a viewport change from collapsed
to 820×1180 (the rotation case); selection overlay inside a note (8 handles,
action bar, swatches); Ctrl+C from a note with its text box focused, then
paste onto a page; right-click Paste into a note; ink in notes storing proper
page coordinates.

End-to-end moon proof: a seeded `Waxing Gibbous` row (a format both earlier
attempts would have missed) was gone after one app launch — no sync, no
token, no user action — with the purge result recorded in
`jotter.lastMoonPurge`. The by-name cleanup was also exercised: preview →
arm → confirm → deleted.

Not verifiable in this environment: real tablet rotation and true PWA update
behavior (hidden preview window suspends focus/rAF; synthetic pointer events
don't move DOM focus). Both are exercised by the same code paths tested above.
