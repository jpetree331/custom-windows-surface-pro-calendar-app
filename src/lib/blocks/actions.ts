import { db } from "@/lib/db/db";
import type { Block, Page, Stroke } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import * as history from "@/lib/history";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";

export async function addStroke(stroke: Stroke) {
  await db.strokes.put(stroke);
  await queueSync("strokes", stroke.id, "put");
  history.push({ kind: "addStroke", stroke });
}

export async function deleteStrokes(strokes: Stroke[]) {
  if (strokes.length === 0) return;
  await db.strokes.bulkDelete(strokes.map((s) => s.id));
  for (const s of strokes) await queueSync("strokes", s.id, "delete");
  history.push({ kind: "deleteStrokes", strokes });
}

export async function addBlock(block: Block) {
  await db.blocks.put(block);
  await queueSync("blocks", block.id, "put");
  history.push({ kind: "addBlock", block });
}

export async function deleteBlock(block: Block) {
  await db.blocks.delete(block.id);
  await queueSync("blocks", block.id, "delete");
  history.push({ kind: "deleteBlock", block });
}

/** Persist a block mutation as one undoable step. */
export async function updateBlock(before: Block, after: Block) {
  await db.blocks.put(after);
  await queueSync("blocks", after.id, "put");
  history.push({ kind: "updateBlock", before, after });
}

export function makeTextBlock(
  pageId: string,
  x: number,
  y: number,
  content = "",
  type: "text" | "task" = "text"
): Block {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    pageId,
    type,
    x,
    y,
    w: 240,
    h: type === "task" ? 44 : 120,
    z: now % 100000,
    content,
    checked: type === "task" ? false : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export async function makeImageBlock(pageId: string, blob: Blob, x: number, y: number): Promise<Block> {
  const dims = await imageSize(blob);
  const maxW = PAGE_W * 0.5;
  const scale = Math.min(1, maxW / dims.w);
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    pageId,
    type: "image",
    x,
    y,
    w: Math.round(dims.w * scale),
    h: Math.round(dims.h * scale),
    z: now % 100000,
    content: "",
    imageBlob: blob,
    createdAt: now,
    updatedAt: now,
  };
}

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = url;
  });
}

/** In-app clipboard for copying blocks between pages. */
let blockClipboard: Block | null = null;

export function copyBlockToClipboard(block: Block) {
  blockClipboard = { ...block };
  if (block.type !== "image" && block.content) {
    void navigator.clipboard?.writeText(block.content).catch(() => {});
  }
}

export function getClipboardBlock(): Block | null {
  return blockClipboard;
}

/** Paste the copied block onto (possibly another) page, slightly offset. */
export async function pasteClipboardBlock(pageId: string): Promise<Block | null> {
  if (!blockClipboard) return null;
  const now = Date.now();
  const clone: Block = {
    ...blockClipboard,
    id: crypto.randomUUID(),
    pageId,
    x: Math.min(blockClipboard.x + 24, PAGE_W - blockClipboard.w),
    y: Math.min(blockClipboard.y + 24, PAGE_H - blockClipboard.h),
    createdAt: now,
    updatedAt: now,
  };
  await addBlock(clone);
  return clone;
}

/** Copy an unfinished task block to the next week's page (same position). */
export async function carryTaskForward(block: Block): Promise<Page | null> {
  const page = await db.pages.get(block.pageId);
  if (!page || page.type !== "week") return null;
  const nextWeek = await db.pages
    .where("plannerId").equals(page.plannerId)
    .and((p) => p.type === "week" && p.dateStart > page.dateStart)
    .sortBy("dateStart")
    .then((arr) => arr[0]);
  if (!nextWeek) return null;
  const now = Date.now();
  await addBlock({
    ...block,
    id: crypto.randomUUID(),
    pageId: nextWeek.id,
    checked: false,
    imageBlob: undefined,
    createdAt: now,
    updatedAt: now,
  });
  return nextWeek;
}

/**
 * Insert a fresh blank note/section page right after `afterPageId` — "add
 * pages willy-nilly". Undoable (reuses the duplicatePage history mechanics
 * with empty content).
 */
export async function addBlankPage(afterPageId: string, label: string): Promise<Page | null> {
  const anchor = await db.pages.get(afterPageId);
  if (!anchor) return null;
  const page: Page = {
    id: crypto.randomUUID(),
    plannerId: anchor.plannerId,
    type: "section",
    index: anchor.index + 1,
    label: label.trim().toUpperCase() || "NOTES",
    monthIndex: -1,
    dateStart: "",
    dateEnd: "",
    meta: { sectionKey: "custom" },
    updatedAt: Date.now(),
  };
  await db.transaction("rw", db.pages, async () => {
    await db.pages
      .where("plannerId").equals(anchor.plannerId)
      .and((p) => p.index > anchor.index)
      .modify((p) => { p.index += 1; });
    await db.pages.add(page);
  });
  await queueSync("pages", page.id, "put");
  history.push({ kind: "duplicatePage", page, strokes: [], blocks: [] });
  return page;
}

/**
 * Instant page duplication — the specific Drawboard pain point. A page is just
 * rows: clone page + strokes + blocks with fresh ids in one transaction.
 */
export async function duplicatePage(pageId: string): Promise<Page | null> {
  const source = await db.pages.get(pageId);
  if (!source) return null;
  const [strokes, blocks] = await Promise.all([
    db.strokes.where("pageId").equals(pageId).toArray(),
    db.blocks.where("pageId").equals(pageId).toArray(),
  ]);
  const now = Date.now();
  const copy: Page = {
    ...source,
    id: crypto.randomUUID(),
    index: source.index + 1,
    label: `${source.label} (copy)`,
    updatedAt: now,
  };
  const strokeCopies = strokes.map((s) => ({ ...s, id: crypto.randomUUID(), pageId: copy.id }));
  const blockCopies = blocks.map((b) => ({ ...b, id: crypto.randomUUID(), pageId: copy.id }));

  await db.transaction("rw", db.pages, db.strokes, db.blocks, async () => {
    await db.pages
      .where("plannerId").equals(source.plannerId)
      .and((p) => p.index > source.index)
      .modify((p) => { p.index += 1; });
    await db.pages.add(copy);
    await db.strokes.bulkAdd(strokeCopies);
    await db.blocks.bulkAdd(blockCopies);
  });
  await queueSync("pages", copy.id, "put");
  history.push({ kind: "duplicatePage", page: copy, strokes: strokeCopies, blocks: blockCopies });
  return copy;
}
