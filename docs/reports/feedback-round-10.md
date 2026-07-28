# Feedback round 10 (Jo) — 14 items

## Bugs owned + fixed
- **Moon-phase events surviving unsubscribe**: the Stage-1 purge matched
  "Full Moon" exactly, but Google titles them "Full moon" — the purge never
  fired. Now case-insensitive; her stale rows clear on the next sync.
- **Moon glyphs at bottom-left**: side effect of the round-9 chips-to-top
  move. Glyph restored to the day's top-right corner (chips leave the corner
  free); holiday names stay bottom-left.

## Changes
- ⬚/lasso around exactly ONE item (no ink) becomes a normal item selection —
  full text menu (`applySelection` in InkCanvas).
- Right-click anywhere on the side-button column opens Settings with the
  Side-buttons accordion expanded and scrolled into view (invisible backing
  rect so the gaps between buttons hit too).
- Settings: Habits / Categories / Side buttons are collapsible accordions
  (`Accordion`, collapsed by default, ﹀/︿).
- Notes List is now a hover/tap MENU anchored at the 🗒 button (old floating
  list window + its kv rect removed).
- Notes fill their window edge-to-edge (letterbox gone; the logical space is
  width-based so free aspect keeps every tool working). Two-finger pinch
  zooms 1–3× (crisp — width scaling, not transform), one finger pans while
  zoomed, transient with a % ↺ reset chip.
- Text-box options bar: flips below the box near the top of a page/note,
  anchors right near the right edge, and is now colors row / tools row /
  actions row (was one long row).
- Bold blue inset outline on TODAY (week rows + month cells).
- New text defaults: 12pt on calendar pages, 18pt in notes (existing text
  untouched — legacy 8pt fallback preserved).
- 🔔 notification + 🎂 birthday chips moved into the weekly REMINDERS panel,
  in line with the pill, wrapping (`WeekReminders`; day cells exclude
  notices via `includeNotices={false}`; month cells unchanged). PDF matches:
  week cells skip notices, the export lists them under its REMINDERS pill.
- ‹ n/N › pager moved from the floating pill into the toolbar (both layout
  modes; keyboard/wheel flips unchanged).

## Review round (3 agents)
Fixed: side-button right-click dead zone between buttons; block drag/resize
clamps hardcoded PAGE_H (blocks could vanish below a landscape note's fold —
now clamps to the measured logical height, ≈PAGE_H on calendar pages); PDF
week-notice parity (was still inline in day cells with an empty REMINDERS
column). Confirmed-correct by review: pinch zoom-around-center math,
cross-year week ranges, selection promotion fallbacks.

Accepted: shrinking a note window's height hides bottom content until
resized taller (nothing is lost; it's the paper metaphor); the today outline
prints on Ctrl+P (accurate at print time); minor chip-markup duplication.

## Verification
97/97 tests; typecheck + build clean. Live (hidden-window env): toolbar
pager + flips, today outline, moon top-right, REMINDERS row, right-click →
settings accordion (gap-click verified via elementFromPoint), notes menu,
note fills window, pinch to 3× + reset, 12/18pt defaults, marquee→text-menu
promotion, bar-below-at-top, two-row bar. NOT live-verifiable this session:
the note drag-clamp fix — the hidden preview window suspends ResizeObserver
delivery entirely (probed: rAF dead), so the measured-height state can't
update in this environment; the clamp math is unit-consistent and RO works
on real devices (letterbox fit proved it in production). Noted in
memory/preview-env-quirks.
