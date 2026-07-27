import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";

/**
 * Pin a chip at a dragged position within its day cell (% of the cell).
 * Deliberately NOT in the undo stack — Ctrl+Z stays about Jo's pen, and a
 * chip nudge is trivially re-doable by dragging it back.
 */
export async function moveEventChip(e: PlannerEvent, offsetX: number, offsetY: number) {
  await db.events.put({ ...e, offsetX, offsetY, updatedAt: Date.now() });
  await queueSync("events", e.id, "put");
}

/** Un-pin: chip returns to its normal place in the day's list. */
export async function resetEventChipPosition(e: PlannerEvent) {
  await db.events.put({ ...e, offsetX: undefined, offsetY: undefined, updatedAt: Date.now() });
  await queueSync("events", e.id, "put");
}
