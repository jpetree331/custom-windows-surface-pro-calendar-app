import type { Page } from "@/lib/db/types";

/**
 * Index of the week page containing `todayISO` — recomputed on every call, so
 * the ✱ Current Week button rolls over automatically at the Monday boundary
 * (and any other day). Clamps to the first/last week outside the planner year.
 */
export function currentWeekPageIndex(pages: Page[], todayISO: string): number {
  const exact = pages.findIndex(
    (p) => p.type === "week" && p.dateStart <= todayISO && todayISO <= p.dateEnd
  );
  if (exact >= 0) return exact;
  const weeks = pages.filter((p) => p.type === "week");
  if (weeks.length === 0) return 0;
  const target = todayISO < weeks[0].dateStart ? weeks[0] : weeks[weeks.length - 1];
  return pages.findIndex((p) => p.id === target.id);
}
