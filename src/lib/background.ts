import { db } from "@/lib/db/db";
import type { Asset } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";

/**
 * Custom page background (Jo r15): one picture per planner year, drawn under
 * the template on every page and cropped to the page's 10:13 shape. Any
 * resolution works; big photos are shrunk on the way in so a 5 MB phone
 * shot doesn't ride along in every backup.
 */

/** Longest useful size — 2× the logical page, plenty for a Surface screen. */
export const BG_MAX_W = PAGE_W * 2;
export const BG_MAX_H = PAGE_H * 2;
export const DEFAULT_BG_STRENGTH = 0.6;

export async function getBackground(plannerId: string): Promise<Asset | undefined> {
  return db.assets.where("[plannerId+kind]").equals([plannerId, "background"]).first();
}

/** Downscale to BG_MAX and re-encode as JPEG where the browser can; in
 *  Node (tests) or on an odd file type the original bytes are kept. */
async function shrink(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, BG_MAX_W / bmp.width, BG_MAX_H / bmp.height);
    if (s === 1 && file.size < 1_500_000) return file; // small enough as-is
    const canvas = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
  } catch {
    return file;
  }
}

/** Replace (or set) the planner's background. Not undoable — Settings shows
 *  the current picture and a Remove button instead. */
export async function setBackground(plannerId: string, file: Blob): Promise<Asset> {
  const blob = await shrink(file);
  const existing = await getBackground(plannerId);
  const row: Asset = {
    id: existing?.id ?? crypto.randomUUID(),
    plannerId,
    kind: "background",
    blob,
    updatedAt: Date.now(),
  };
  await db.assets.put(row);
  await queueSync("assets", row.id, "put");
  return row;
}

export async function clearBackground(plannerId: string) {
  const existing = await getBackground(plannerId);
  if (!existing) return;
  await db.assets.delete(existing.id);
  await queueSync("assets", existing.id, "delete");
}

/** How strongly the picture shows through (0.1–1); lives in planner
 *  settings so it backs up with the planner. */
export async function setBackgroundStrength(plannerId: string, strength: number) {
  const p = await db.planners.get(plannerId);
  if (!p) return;
  const settings = { ...p.settings, backgroundStrength: Math.min(1, Math.max(0.1, strength)) };
  await db.planners.update(plannerId, { settings, updatedAt: Date.now() });
  await queueSync("planners", plannerId, "put");
}

export function backgroundStrengthOf(settings: Record<string, unknown> | undefined): number {
  const v = settings?.backgroundStrength;
  return typeof v === "number" ? Math.min(1, Math.max(0.1, v)) : DEFAULT_BG_STRENGTH;
}
