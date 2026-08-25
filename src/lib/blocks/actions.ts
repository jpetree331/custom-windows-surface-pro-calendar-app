import { db } from "@/lib/db/db";
import type { Block, Page, Stroke } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import * as history from "@/lib/history";
import { clearPathCache } from "@/lib/ink/render";
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
  type: "text" | "task" = "text",
  color?: string,
  // Jo's defaults: 12pt on calendar pages, 18pt in notes (callers override).
  // Pre-existing blocks keep rendering at the legacy 8pt fallback.
  fontSize = 12
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
    color,
    fontSize,
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

/** When the app last filled a clipboard of its own. Ctrl+V weighs this
 *  against the last time the window lost focus: the OS clipboard can only
 *  have changed while she was off in another program, so anything copied
 *  here since then is the newer intent (Jo r13). */
let internalCopyAt = 0;
export function internalClipboardAt(): number {
  return internalCopyAt;
}

export function copyBlockToClipboard(block: Block) {
  blockClipboard = { ...block };
  internalCopyAt = Date.now();
  // Mutually exclusive with the ⬚ clipboard: Ctrl+V pastes whichever was
  // copied LAST — a stale area copy must never pre-empt a fresh block copy.
  selectionClipboard = null;
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

/* ------------------------- ⬚ area selection ops ------------------------- */

export interface AreaSelectionRef {
  pageId: string;
  strokeIds: string[];
  blockIds: string[];
}

async function selectionRows(sel: AreaSelectionRef): Promise<{ strokes: Stroke[]; blocks: Block[] }> {
  const [strokes, blocks] = await Promise.all([
    db.strokes.bulkGet(sel.strokeIds),
    db.blocks.bulkGet(sel.blockIds),
  ]);
  return {
    strokes: strokes.filter((s): s is Stroke => !!s),
    blocks: blocks.filter((b): b is Block => !!b),
  };
}

/** Shift every selected stroke point and block by (dx, dy) — one undo step. */
export async function moveSelectionContents(sel: AreaSelectionRef, dx: number, dy: number) {
  const { strokes, blocks } = await selectionRows(sel);
  if (strokes.length === 0 && blocks.length === 0) return;
  const now = Date.now();
  const strokesAfter = strokes.map((s) => ({
    ...s,
    points: s.points.map(([x, y, p]) => [x + dx, y + dy, p] as [number, number, number]),
  }));
  const blocksAfter = blocks.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy, updatedAt: now }));
  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkPut(strokesAfter);
    await db.blocks.bulkPut(blocksAfter);
  });
  for (const s of strokesAfter) await queueSync("strokes", s.id, "put");
  for (const b of blocksAfter) await queueSync("blocks", b.id, "put");
  clearSelectionPathCache(sel);
  history.push({
    kind: "batch",
    entries: [
      { kind: "updateStrokes", before: strokes, after: strokesAfter },
      ...blocks.map((b, i) => ({ kind: "updateBlock" as const, before: b, after: blocksAfter[i] })),
    ],
  });
}

/**
 * Scale everything in a selection from baseRect→targetRect, SAME membership
 * (a resize-drag scales what's selected — it does not re-capture what now
 * falls inside the box). Stroke width and block fontSize scale by the
 * geometric-mean factor; point pressure is untouched. One undo step.
 */
export async function scaleSelectionContents(
  sel: AreaSelectionRef,
  baseRect: { x: number; y: number; w: number; h: number },
  targetRect: { x: number; y: number; w: number; h: number }
) {
  const { strokes, blocks } = await selectionRows(sel);
  if (strokes.length === 0 && blocks.length === 0) return;
  const sx = targetRect.w / Math.max(1e-6, baseRect.w);
  const sy = targetRect.h / Math.max(1e-6, baseRect.h);
  const sAvg = Math.sqrt(Math.max(1e-6, sx * sy));
  const mapX = (x: number) => targetRect.x + (x - baseRect.x) * sx;
  const mapY = (y: number) => targetRect.y + (y - baseRect.y) * sy;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const now = Date.now();

  const strokesAfter = strokes.map((s) => ({
    ...s,
    points: s.points.map(([x, y, p]) => [mapX(x), mapY(y), p] as [number, number, number]),
    width: clamp(s.width * sAvg, 0.15, 8),
  }));
  const blocksAfter = blocks.map((b) => ({
    ...b,
    x: mapX(b.x),
    y: mapY(b.y),
    w: Math.max(20, b.w * sx),
    h: Math.max(16, b.h * sy),
    fontSize:
      b.fontSize !== undefined ? clamp(Math.round(b.fontSize * sAvg), 5, 28) : b.fontSize,
    updatedAt: now,
  }));

  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkPut(strokesAfter);
    await db.blocks.bulkPut(blocksAfter);
  });
  for (const s of strokesAfter) await queueSync("strokes", s.id, "put");
  for (const b of blocksAfter) await queueSync("blocks", b.id, "put");
  clearSelectionPathCache(sel); // geometry changed — cached outlines are stale
  history.push({
    kind: "batch",
    entries: [
      { kind: "updateStrokes", before: strokes, after: strokesAfter },
      ...blocks.map((b, i) => ({ kind: "updateBlock" as const, before: b, after: blocksAfter[i] })),
    ],
  });
}

/**
 * Recolor every selected stroke (and text/task blocks' text) as one undo
 * step. Image blocks and eraser strokes are skipped. No path-cache clear:
 * color is applied at draw time, not baked into the cached outline.
 */
export async function recolorSelectionContents(sel: AreaSelectionRef, color: string) {
  const { strokes, blocks } = await selectionRows(sel);
  const now = Date.now();
  const inkBefore = strokes.filter((s) => s.tool !== "eraser");
  const strokesAfter = inkBefore.map((s) => ({ ...s, color }));
  const textBefore = blocks.filter((b) => b.type !== "image");
  const blocksAfter = textBefore.map((b) => ({ ...b, color, categoryId: undefined, updatedAt: now }));
  if (strokesAfter.length === 0 && blocksAfter.length === 0) return;
  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkPut(strokesAfter);
    await db.blocks.bulkPut(blocksAfter);
  });
  for (const s of strokesAfter) await queueSync("strokes", s.id, "put");
  for (const b of blocksAfter) await queueSync("blocks", b.id, "put");
  history.push({
    kind: "batch",
    entries: [
      { kind: "updateStrokes", before: inkBefore, after: strokesAfter },
      ...textBefore.map((b, i) => ({ kind: "updateBlock" as const, before: b, after: blocksAfter[i] })),
    ],
  });
}

/** Delete everything inside the selection — one undo step brings it all back. */
export async function deleteSelectionContents(sel: AreaSelectionRef) {
  const { strokes, blocks } = await selectionRows(sel);
  if (strokes.length === 0 && blocks.length === 0) return;
  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkDelete(strokes.map((s) => s.id));
    await db.blocks.bulkDelete(blocks.map((b) => b.id));
  });
  for (const s of strokes) await queueSync("strokes", s.id, "delete");
  for (const b of blocks) await queueSync("blocks", b.id, "delete");
  clearSelectionPathCache(sel);
  history.push({
    kind: "batch",
    entries: [
      { kind: "deleteStrokes", strokes },
      ...blocks.map((b) => ({ kind: "deleteBlock" as const, block: b })),
    ],
  });
}

/** Clone the selection slightly offset; returns the clone's ids. */
export async function duplicateSelectionContents(
  sel: AreaSelectionRef,
  offset = 24
): Promise<AreaSelectionRef> {
  const { strokes, blocks } = await selectionRows(sel);
  const now = Date.now();
  const strokeCopies = strokes.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    points: s.points.map(([x, y, p]) => [x + offset, y + offset, p] as [number, number, number]),
    createdAt: now,
  }));
  const blockCopies = blocks.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    x: b.x + offset,
    y: b.y + offset,
    createdAt: now,
    updatedAt: now,
  }));
  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkAdd(strokeCopies);
    await db.blocks.bulkAdd(blockCopies);
  });
  for (const s of strokeCopies) await queueSync("strokes", s.id, "put");
  for (const b of blockCopies) await queueSync("blocks", b.id, "put");
  history.push({
    kind: "batch",
    entries: [
      ...strokeCopies.map((stroke) => ({ kind: "addStroke" as const, stroke })),
      ...blockCopies.map((block) => ({ kind: "addBlock" as const, block })),
    ],
  });
  return { pageId: sel.pageId, strokeIds: strokeCopies.map((s) => s.id), blockIds: blockCopies.map((b) => b.id) };
}

function clearSelectionPathCache(sel: AreaSelectionRef) {
  clearPathCache(sel.strokeIds);
}

/** Clipboard for ⬚ selections — contents normalized to their bbox origin. */
let selectionClipboard: { strokes: Stroke[]; blocks: Block[]; w: number; h: number } | null = null;

export function hasSelectionClipboard(): boolean {
  return selectionClipboard !== null;
}

/** Copy (or cut) everything in the selection for pasting on ANY page. */
export async function copySelectionToClipboard(sel: AreaSelectionRef, cut: boolean) {
  const { strokes, blocks } = await selectionRows(sel);
  if (strokes.length === 0 && blocks.length === 0) return;
  blockClipboard = null; // last copy wins (see copyBlockToClipboard)
  internalCopyAt = Date.now();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s.points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  for (const b of blocks) {
    if (b.x < minX) minX = b.x; if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y < minY) minY = b.y; if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  selectionClipboard = {
    strokes: strokes.map((s) => ({
      ...s,
      points: s.points.map(([x, y, p]) => [x - minX, y - minY, p] as [number, number, number]),
    })),
    blocks: blocks.map((b) => ({ ...b, x: b.x - minX, y: b.y - minY })),
    w: maxX - minX,
    h: maxY - minY,
  };
  if (cut) await deleteSelectionContents(sel);
}

/** Paste the copied selection centered at (x, y) on `pageId` — one undo step.
 *  Returns the pasted contents WITH their rect so the caller can select them
 *  (visible feedback + immediately draggable). */
export async function pasteSelectionAt(
  pageId: string,
  x: number,
  y: number
): Promise<(AreaSelectionRef & { rect: { x: number; y: number; w: number; h: number } }) | null> {
  const clip = selectionClipboard;
  if (!clip) return null;
  const now = Date.now();
  const ox = Math.max(0, Math.min(PAGE_W - clip.w, x - clip.w / 2));
  const oy = Math.max(0, Math.min(PAGE_H - clip.h, y - clip.h / 2));
  const strokes = clip.strokes.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    pageId,
    points: s.points.map(([px, py, p]) => [px + ox, py + oy, p] as [number, number, number]),
    createdAt: now,
  }));
  const blocks = clip.blocks.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    pageId,
    x: b.x + ox,
    y: b.y + oy,
    createdAt: now,
    updatedAt: now,
  }));
  await db.transaction("rw", db.strokes, db.blocks, async () => {
    await db.strokes.bulkAdd(strokes);
    await db.blocks.bulkAdd(blocks);
  });
  for (const s of strokes) await queueSync("strokes", s.id, "put");
  for (const b of blocks) await queueSync("blocks", b.id, "put");
  history.push({
    kind: "batch",
    entries: [
      ...strokes.map((stroke) => ({ kind: "addStroke" as const, stroke })),
      ...blocks.map((block) => ({ kind: "addBlock" as const, block })),
    ],
  });
  return {
    pageId,
    strokeIds: strokes.map((s) => s.id),
    blockIds: blocks.map((b) => b.id),
    rect: { x: ox, y: oy, w: Math.max(clip.w, 20), h: Math.max(clip.h, 20) },
  };
}

/** In-app clipboard for whole pages (content travels with the page). */
let pageClipboard: { page: Page; strokes: Stroke[]; blocks: Block[] } | null = null;

export function hasPageClipboard(): boolean {
  return pageClipboard !== null;
}

export async function copyPageToClipboard(pageId: string): Promise<boolean> {
  const page = await db.pages.get(pageId);
  if (!page) return false;
  const [strokes, blocks] = await Promise.all([
    db.strokes.where("pageId").equals(pageId).toArray(),
    db.blocks.where("pageId").equals(pageId).toArray(),
  ]);
  pageClipboard = { page, strokes, blocks };
  return true;
}

/** Paste the copied page (with all its ink/blocks) right after `afterPageId`. */
export async function pastePageAfter(afterPageId: string): Promise<Page | null> {
  if (!pageClipboard) return null;
  const anchor = await db.pages.get(afterPageId);
  if (!anchor) return null;
  const src = pageClipboard;
  const copy: Page = {
    ...src.page,
    id: crypto.randomUUID(),
    plannerId: anchor.plannerId,
    index: anchor.index + 1,
    // Copies keep dates for rendering but must never win date-based navigation.
    meta: { ...src.page.meta, isCopy: true },
    updatedAt: Date.now(),
  };
  const strokes = src.strokes.map((s) => ({ ...s, id: crypto.randomUUID(), pageId: copy.id }));
  const blocks = src.blocks.map((b) => ({ ...b, id: crypto.randomUUID(), pageId: copy.id }));
  await db.transaction("rw", db.pages, db.strokes, db.blocks, async () => {
    await db.pages
      .where("plannerId").equals(anchor.plannerId)
      .and((p) => p.index > anchor.index)
      .modify((p) => { p.index += 1; });
    await db.pages.add(copy);
    await db.strokes.bulkAdd(strokes);
    await db.blocks.bulkAdd(blocks);
  });
  await queueSync("pages", copy.id, "put");
  history.push({ kind: "duplicatePage", page: copy, strokes, blocks });
  return copy;
}

/** Delete a page with everything on it. Undoable (Ctrl+Z restores). */
export async function deletePage(pageId: string): Promise<boolean> {
  const page = await db.pages.get(pageId);
  if (!page) return false;
  const [strokes, blocks] = await Promise.all([
    db.strokes.where("pageId").equals(pageId).toArray(),
    db.blocks.where("pageId").equals(pageId).toArray(),
  ]);
  await db.transaction("rw", db.pages, db.strokes, db.blocks, async () => {
    await db.strokes.bulkDelete(strokes.map((s) => s.id));
    await db.blocks.bulkDelete(blocks.map((b) => b.id));
    await db.pages.delete(page.id);
    await db.pages
      .where("plannerId").equals(page.plannerId)
      .and((p) => p.index > page.index)
      .modify((p) => { p.index -= 1; });
  });
  await queueSync("pages", page.id, "delete");
  history.push({ kind: "deletePage", page, strokes, blocks });
  return true;
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
    label: label.trim() || "NOTES", // her capitalization, kept (Jo r12)
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
 * Paste whichever internal clipboard is loaded (an ⬚ selection wins over a
 * single copied item), centered on `pageId`. One place decides that order so
 * the keyboard path and the notes' right-click menu can't drift apart.
 */
export async function pasteAnyClipboardCentered(
  pageId: string,
  x = PAGE_W / 2,
  y = PAGE_H / 2
): Promise<
  { kind: "selection"; selection: AreaSelectionRef & { rect: { x: number; y: number; w: number; h: number } } }
  | { kind: "block"; block: Block }
  | null
> {
  if (hasSelectionClipboard()) {
    const selection = await pasteSelectionAt(pageId, x, y);
    return selection ? { kind: "selection", selection } : null;
  }
  const block = await pasteClipboardBlock(pageId);
  return block ? { kind: "block", block } : null;
}

/** Rename a page. Keeps her capitalization now that titles are typed
 *  directly on the page (Jo r12); not undoable, matching habit/category
 *  renames in settings. */
export async function renamePage(pageId: string, label: string) {
  const clean = label.trim();
  if (!clean) return;
  await db.pages.update(pageId, { label: clean, updatedAt: Date.now() });
  await queueSync("pages", pageId, "put");
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
    // Copies keep dates for rendering but must never win date-based navigation.
    meta: { ...source.meta, isCopy: true },
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
