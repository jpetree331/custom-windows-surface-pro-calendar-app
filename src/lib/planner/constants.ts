/** Logical page size — templates lay out in % of this; ink coords use it too. */
export const PAGE_W = 1000;
export const PAGE_H = 1300;

export const PLANNER_YEAR = 2026;

/**
 * HABITS grid region on week pages, in % of page size. The interactive grid
 * overlay renders here, ABOVE the ink canvas, so pen taps toggle checks.
 */
export const HABIT_REGION = { left: 58.9, width: 36.5, bottom: 2.0, height: 18.5 };

/** Section pages at the back of the planner (13 pages → 79 total). */
export const SECTIONS: { key: string; label: string; count: number }[] = [
  { key: "todo", label: "TO DO", count: 2 },
  { key: "business", label: "BUSINESS", count: 3 },
  { key: "clean", label: "CLEAN & ORGANIZE", count: 1 },
  { key: "habits", label: "HABITS", count: 1 },
  { key: "shopping", label: "SHOPPING", count: 1 },
  { key: "holidays", label: "HOLIDAYS", count: 1 },
  { key: "birthdays", label: "BIRTHDAYS", count: 1 },
  { key: "notes", label: "NOTES", count: 3 },
];

// Side buttons became per-planner Dexie rows (editable in Settings) — the
// factory defaults live in src/lib/planner/sideButtons.ts.
