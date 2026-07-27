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

export async function addSideButton(
  plannerId: string,
  init?: Partial<Omit<SideButton, "id" | "plannerId" | "order">>
): Promise<SideButton> {
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
  await db.sideButtons.delete(id);
  await queueSync("sideButtons", id, "delete");
}

/** Swap `order` VALUES with the sorted neighbor — stays correct even after
 *  deletions leave gaps in the sequence. */
export async function moveSideButton(plannerId: string, id: string, dir: 1 | -1) {
  const sorted = await db.sideButtons.where("plannerId").equals(plannerId).sortBy("order");
  const i = sorted.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  await db.sideButtons.bulkPut([
    { ...sorted[i], order: sorted[j].order },
    { ...sorted[j], order: sorted[i].order },
  ]);
  await queueSync("sideButtons", sorted[i].id, "put");
  await queueSync("sideButtons", sorted[j].id, "put");
}
