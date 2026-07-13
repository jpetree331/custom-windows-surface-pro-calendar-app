import type { Page } from "@/lib/db/types";

/**
 * findIndex that prefers ORIGINAL pages over user-made copies. Duplicated /
 * pasted week+month pages keep their dates for rendering but carry
 * `meta.isCopy`, so navigation (✱ button, month tabs, PDF links) must target
 * the original — falling back to a copy only if no original matches.
 */
export function preferOriginalIndex(pages: Page[], pred: (p: Page) => boolean): number {
  let fallback = -1;
  for (let i = 0; i < pages.length; i++) {
    if (!pred(pages[i])) continue;
    if (!pages[i].meta?.isCopy) return i;
    if (fallback < 0) fallback = i;
  }
  return fallback;
}

/**
 * Index of the week page containing `todayISO` — recomputed on every call, so
 * the ✱ Current Week button rolls over automatically at the Monday boundary
 * (and any other day). Clamps to the first/last week outside the planner year.
 */
export function currentWeekPageIndex(pages: Page[], todayISO: string): number {
  const exact = preferOriginalIndex(
    pages,
    (p) => p.type === "week" && p.dateStart <= todayISO && todayISO <= p.dateEnd
  );
  if (exact >= 0) return exact;
  const originals = pages.filter((p) => p.type === "week" && !p.meta?.isCopy);
  const weeks = originals.length > 0 ? originals : pages.filter((p) => p.type === "week");
  if (weeks.length === 0) return 0;
  const target = todayISO < weeks[0].dateStart ? weeks[0] : weeks[weeks.length - 1];
  return pages.findIndex((p) => p.id === target.id);
}
