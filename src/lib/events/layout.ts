/** Pure math for chip drag-within-a-day (unit-tested; no DOM). */

import type { EventKind, PlannerEvent } from "@/lib/db/types";

/** Jo's order within a day (r14): birthdays, then appointments, then Google
 *  Tasks; derived reminder chips last. Ties keep clock order, all-day first,
 *  then title — the database handed them back in id order, i.e. shuffled. */
const KIND_RANK: Record<EventKind, number> = { birthday: 0, event: 1, reminder: 2, notice: 3 };

export function sortDayEvents<T extends Pick<PlannerEvent, "kind" | "startTime" | "title">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.title.localeCompare(b.title)
  );
}

export interface Box {
  w: number;
  h: number;
}

/**
 * Convert a drag delta into a clamped cell-relative position (% of cell).
 * `seed` is the chip's rendered position when the drag started, as %.
 * The chip must stay fully inside its day cell.
 */
export function clampChipOffset(
  cell: Box,
  chip: Box,
  seed: { x: number; y: number },
  dxPx: number,
  dyPx: number
): { x: number; y: number } {
  const maxX = Math.max(0, 100 - (chip.w / Math.max(1, cell.w)) * 100);
  const maxY = Math.max(0, 100 - (chip.h / Math.max(1, cell.h)) * 100);
  const x = seed.x + (dxPx / Math.max(1, cell.w)) * 100;
  const y = seed.y + (dyPx / Math.max(1, cell.h)) * 100;
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}
