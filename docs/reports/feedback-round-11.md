# Feedback round 11 (Jo) — 11 items

**Process note, honestly recorded:** round 11 was designed and approved in a
prior session but the implementation go-ahead was lost between threads —
nothing shipped, which is why Jo's "still broken" list matched the original.
This round is the first code for all of it.

## Root causes worth remembering

- **Ctrl+V**: the browser only fires a `paste` event when the OS clipboard
  has content. Cut ink lives in the app's internal clipboard — so Ctrl+V
  never fired at all. Paste is now handled on keydown against the internal
  clipboards; the native paste event still delivers OS images/text.
- **Ctrl+C/X on single items**: round 10's "one item promotes to an item
  selection" left the hotkeys wired only for area selections. They now
  cover the selected item too (cut = copy + undoable delete).
- **Immortal moon phases**: the purge only ran inside a successful Google
  sync; Jo's auto-sync token had lapsed, so it never executed. It now also
  runs at every app launch (local-only, tokenless), with normalized title
  matching (case, glyph prefixes, third-quarter variants) that still spares
  real events like "Full Moon party".

## Changes

- Notes: every note starts as (and opens with) a full-page 18pt body text
  box, cursor ready — pen tools still draw over it. Title is click-to-edit
  (a resting `<input>` let Windows Ink's handwriting panel type pen strokes
  into it; a button can't receive handwriting). A typed title is never
  overwritten by body content.
- Notes menu: sort A–Z / Recent / Custom (▲▼), persisted. "Recent" uses the
  latest of title-edit and body-edit times; window drags/focus/open/close
  deliberately don't reshuffle it.
- Z-bands: notes 1000–2600 (renormalized), popovers 3000+, dialogs 3200,
  notes menu 3990+ — the menu is never behind a note; Settings covers notes.
- Eraser: tap-again size editor (2–20pt slider), persisted
  (`jotter.eraserRadius`), live in the ink pipeline.
- Google: reminders firing in the same Mon–Sun week as their event are no
  longer generated; done-checkoff (☐/☑ in the expanded chip + details
  popover) crosses items out, persists across re-syncs, suppresses the
  item's future 🔔 chips, and prints struck-through; past events (not tasks
  or birthdays) fade on screen (deliberately not in the PDF — documented).

## Review round (3 agents, 3 real bugs + 3 cleanups)

Fixed from review: (1) a stale ⬚-selection clipboard permanently pre-empted
Ctrl+V for the whole session — the two internal clipboards are now mutually
exclusive, last copy wins; (2) Ctrl+C/V on a block inside a note pasted onto
the calendar page hidden behind it — pastes now target the focused note
(`activeNoteRef`, cleared when the planner is tapped); (3) focusing/opening/
dragging notes bumped `updatedAt` and scrambled the Recent sort, and the
auto-opened body wrote a no-op update on every blur — chrome writes now skip
`updatedAt`, and saveText only writes real changes. Cleanups: `mondayOf`
reuses dates.ts; `moveNote` writes 2 rows not N; PDF past-fade omission
documented. Deferred with reasoning: popover-shell extraction and a z-index
constants module (Tailwind's scanner needs static class literals).

## Verification

99/99 tests (same-week skip incl. the Sunday boundary, done preservation +
notice suppression, purge variants). Live: eraser editor + persistence,
menu z 4000 + sorts, note body cursor-ready at 18pt full-width, title
button→input→commit, typed-title stability, Settings above notes,
single-item Ctrl+X/V round-trip, ink marquee Ctrl+C/V, past-fade +
done-strike + persistence, fresh-block-copy-beats-stale-area-copy, and
paste-into-focused-note (calendar untouched). Typecheck + build clean.
Preview-window stalls limited some cleanup automation; test artifacts were
removed via direct DB ops.
