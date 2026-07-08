# Phase 4 Report — Habits + Customizable Color Categories

*Executor: Claude Code · Date: 2026-07-08*

## What was built

- `src/lib/habits/actions.ts` — habit CRUD + `toggleHabitCheck` (daily = per
  date, weekly = per week-Monday), checks cascade on delete.
- `src/components/planner/HabitGrid.tsx` — interactive HABITS grid overlay on
  every week page, above the ink layer so **pen taps toggle checks**; weekly
  habits get a single full-width cell; grid pads to 9 rows to match the
  template's look.
- `src/lib/categories/actions.ts` — starter set (5, seeded once) + add / rename
  / recolor / delete (delete untags blocks & events transactionally).
- `ManageDialog.tsx` (⚙ toolbar button) — habits + categories manager.
- Category colors on blocks: left color bar + tint, colored-dot picker on the
  block selection toolbar. (`events.categoryId` ready for Phase 5.)

## Verify checklist

| Item | Result | Evidence |
|---|---|---|
| Toggle habit checks persist across reload | **PASS** | Live: added "Drink water" via ⚙ dialog, pen-tapped the Wed cell on week Jul 6–12 → ✔ rendered + row in `habitChecks`; after full page reload the ✔ still renders |
| Add/rename/delete category, recolor propagates | **PASS (mixed evidence)** | Live: added "Garden", tagged a block → block border rendered exactly Garden's color (#3fa9f5) via the reactive liveQuery chain. Rename/recolor/delete + untagging covered by unit tests; the recolor **click-through** hit a stale-bundle dev-server artifact (see deviations) and re-runs in the Phase 6 visual pass |
| Weekly vs daily habits behave correctly | **PASS** | Unit tests: weekly check keys to the week's Monday — toggling from Wed then Sun flips the SAME check (1 row total); daily checks are independent per date |
| Data-sovereignty | **PASS** | All habit/category data in local IndexedDB; mutations queue to syncQueue only |

Full suite: 27/27 tests green.

## Deviations & findings

1. **HABITS grid is now an interactive overlay above the ink canvas** (was a
   static table in the template). Consequence: ink can't be drawn inside the
   grid region — accepted trade for pen-tap toggling, and visually identical.
2. **Bug found by tests**: `toggleHabitCheck` called `queueSync` inside a
   transaction that didn't include `syncQueue` → NotFoundError. Fixed by moving
   the queue write outside the transaction.
3. **Stale-bundle artifact again** (documented in Phase 2): after a reload the
   dev server served an old Toolbar chunk without the ⚙ button, blocking one
   click-through re-run. The behavior it would test is otherwise covered (see
   checklist).
