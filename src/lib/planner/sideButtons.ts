import { db } from "@/lib/db/db";
import type { SideButton } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";

/**
 * Factory defaults = the classic six (Gate C legend). colorHex values are the
 * solid equivalents the PDF export already used for these buttons — one color
 * now drives both the CSS bevel gradient and pdf-lib.
 */
export const DEFAULT_SIDE_BUTTONS: Omit<SideButton, "id" | "plannerId" | "order">[] = [
  { glyph: "✱", label: "Current Week", target: "current-week", colorHex: "#5a6cf0" },
  { glyph: "T", label: "To Do", target: "todo", colorHex: "#3fa9f5" },
  { glyph: "B", label: "Business", target: "business", colorHex: "#6dbb3c" },
  { glyph: "H", label: "Habits", target: "habits", colorHex: "#f2599a" },
  { glyph: "N", label: "Notes", target: "notes", colorHex: "#f28d49" },
  { glyph: "🎂", label: "Birthdays", target: "birthdays", colorHex: "#f6d5e2" },
];

/** Reproduce the classic bevel look from a single stored color. */
export function gradientFrom(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const lift = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.35));
  const r = lift((n >> 16) & 255);
  const g = lift((n >> 8) & 255);
  const b = lift(n & 255);
  return `linear-gradient(135deg, rgb(${r},${g},${b}), ${hex})`;
}

/** First-run-only, per planner (same idempotent pattern as categories). */
export async function ensureSideButtonsSeeded(plannerId: string) {
  const existing = await db.sideButtons.where("plannerId").equals(plannerId).count();
  if (existing > 0) return;
  const rows = DEFAULT_SIDE_BUTTONS.map((b, i) => ({
    ...b,
    id: crypto.randomUUID(),
    plannerId,
    order: i,
  }));
  await db.sideButtons.bulkAdd(rows);
  for (const r of rows) await queueSync("sideButtons", r.id, "put");
}

/** Renumber a planner's buttons 0…n-1 in their current visual order.
 *  Jo r13: `order` used to be assigned from the row COUNT, so once a button
 *  had been deleted a new one collided with an existing position — and since
 *  reordering swaps order VALUES, two rows sharing a value could never pass
 *  each other (her Birthdays button was stuck at spot 5). */
async function reindex(plannerId: string) {
  const sorted = await db.sideButtons.where("plannerId").equals(plannerId).sortBy("order");
  await Promise.all(
    sorted.map(async (b, i) => {
      if (b.order === i) return;
      await db.sideButtons.update(b.id, { order: i });
      await queueSync("sideButtons", b.id, "put");
    })
  );
}

export async function addSideButton(
  plannerId: string,
  init?: Partial<Omit<SideButton, "id" | "plannerId" | "order">>
): Promise<SideButton> {
  await reindex(plannerId); // guarantee a clean 0…n-1 run before appending
  const count = await db.sideButtons.where("plannerId").equals(plannerId).count();
  const row: SideButton = {
    id: crypto.randomUUID(),
    plannerId,
    order: count,
    glyph: init?.glyph ?? "•",
    label: init?.label ?? "New button",
    colorHex: init?.colorHex ?? "#94a3b8",
    target: init?.target ?? "current-week",
  };
  await db.sideButtons.add(row);
  await queueSync("sideButtons", row.id, "put");
  return row;
}

export async function updateSideButton(id: string, patch: Partial<SideButton>) {
  await db.sideButtons.update(id, patch);
  await queueSync("sideButtons", id, "put");
}

export async function deleteSideButton(id: string) {
  const row = await db.sideButtons.get(id);
  await db.sideButtons.delete(id);
  await queueSync("sideButtons", id, "delete");
  if (row) await reindex(row.plannerId); // no gaps left behind to collide with
}

/** Move one button up/down a slot. Renumbers first, so a row can always
 *  pass its neighbour even if older data left duplicate order values. */
export async function moveSideButton(plannerId: string, id: string, dir: 1 | -1) {
  await reindex(plannerId);
  const sorted = await db.sideButtons.where("plannerId").equals(plannerId).sortBy("order");
  const i = sorted.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  await db.sideButtons.bulkPut([
    { ...sorted[i], order: j },
    { ...sorted[j], order: i },
  ]);
  await queueSync("sideButtons", sorted[i].id, "put");
  await queueSync("sideButtons", sorted[j].id, "put");
}
