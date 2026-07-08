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

/** Side buttons (Gate C legend, confirmed against buttons.png). */
export const SIDE_BUTTONS: {
  key: string;
  glyph: string;
  title: string;
  /** section key to jump to, or "current-week". */
  target: string;
  /** button face gradient. */
  bg: string;
}[] = [
  { key: "week", glyph: "✱", title: "Current Week", target: "current-week", bg: "linear-gradient(135deg,#7f9df7,#5a6cf0)" },
  { key: "todo", glyph: "T", title: "To Do", target: "todo", bg: "linear-gradient(135deg,#5bc8f5,#3fa9f5)" },
  { key: "business", glyph: "B", title: "Business", target: "business", bg: "linear-gradient(135deg,#9fdc5a,#6dbb3c)" },
  { key: "habits", glyph: "H", title: "Habits", target: "habits", bg: "linear-gradient(135deg,#f78fb8,#f2599a)" },
  { key: "notes", glyph: "N", title: "Notes", target: "notes", bg: "linear-gradient(135deg,#f7b980,#f28d49)" },
  { key: "birthdays", glyph: "🎂", title: "Birthdays", target: "birthdays", bg: "linear-gradient(135deg,#fbe6ef,#f6d5e2)" },
];
