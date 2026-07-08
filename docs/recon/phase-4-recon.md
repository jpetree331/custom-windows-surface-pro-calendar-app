# Phase 4 Recon — Habits + Customizable Color Categories

## Schema deltas

None — the Phase 0 schema already carried `habits`, `habitChecks` (unique
`[habitId+date]`), and `categories`. Phase 4 only adds behavior.

- **Check keying**: a daily habit's check is keyed by the day's ISO date; a
  weekly habit's check collapses to the **Monday** of its week (`checkDate()`),
  so toggling from any weekday flips the same single check.
- **Category deletion untags** its blocks/events inside one transaction (no
  dangling categoryId).

## The pen-tap problem (key decision)

The ink canvas sits on top of everything and captures pen input, but the plan
requires the habit grid to be "tappable/pennable to toggle." Solution: the
HABITS grid moved out of the static week template into an **interactive overlay
rendered above the ink canvas** (`HabitGrid.tsx`), pinned to a fixed page region
(`HABIT_REGION`, % coordinates). Pen taps inside the grid toggle checks; ink
strokes can't start there (a deliberate trade — nobody handwrites inside a
checkbox matrix). Weekly habits render one full-width cell (colspan 7); daily
habits render Mon–Sun cells. Empty rows pad the grid to 9 lines to keep the
template's look.

## Settings UI

`ManageDialog.tsx` (⚙ in the toolbar): rename-in-place inputs, daily/weekly
selector, delete, add-new for habits; color-picker + rename + delete + add for
categories. Starter categories (Family/Business/Health/Home/Fun) seed once per
planner. Category colors apply to text/task blocks as a left bar + soft tint;
tagging happens from a colored-dot row on the block selection UI. Events reuse
`categoryId` in Phase 5.
