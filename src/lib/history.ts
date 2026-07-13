import { db } from "@/lib/db/db";
import type { Block, Page, Stroke } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { clearPathCache } from "@/lib/ink/render";

/** Undoable mutations. Each stores enough data to run in both directions. */
export type HistoryEntry =
  | { kind: "addStroke"; stroke: Stroke }
  | { kind: "deleteStrokes"; strokes: Stroke[] }
  | { kind: "addBlock"; block: Block }
  | { kind: "deleteBlock"; block: Block }
  | { kind: "updateBlock"; before: Block; after: Block }
  | { kind: "duplicatePage"; page: Page; strokes: Stroke[]; blocks: Block[] }
  | { kind: "deletePage"; page: Page; strokes: Stroke[]; blocks: Block[] };

const MAX = 200;
interface ScopedEntry {
  entry: HistoryEntry;
  /** Planner the mutation happened on — undo/redo only touch the active year. */
  plannerId: string;
}
let undoStack: ScopedEntry[] = [];
let redoStack: ScopedEntry[] = [];
let activePlannerId = "";
const listeners = new Set<() => void>();

export function onHistoryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

/** Ctrl+Z must never silently edit a year the user isn't looking at. */
export function setActivePlanner(id: string) {
  activePlannerId = id;
  notify();
}

const lastActiveIndex = (stack: ScopedEntry[]) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].plannerId === activePlannerId) return i;
  }
  return -1;
};

export function canUndo() { return lastActiveIndex(undoStack) >= 0; }
export function canRedo() { return lastActiveIndex(redoStack) >= 0; }

/** Record an already-applied mutation (attributed to the active planner). */
export function push(entry: HistoryEntry) {
  undoStack.push({ entry, plannerId: activePlannerId });
  if (undoStack.length > MAX) undoStack.shift();
  redoStack = [];
  notify();
}

async function apply(entry: HistoryEntry, dir: "undo" | "redo") {
  const fwd = dir === "redo";
  switch (entry.kind) {
    case "addStroke":
      if (fwd) await db.strokes.put(entry.stroke);
      else await db.strokes.delete(entry.stroke.id);
      await queueSync("strokes", entry.stroke.id, fwd ? "put" : "delete");
      clearPathCache([entry.stroke.id]);
      break;
    case "deleteStrokes":
      if (fwd) await db.strokes.bulkDelete(entry.strokes.map((s) => s.id));
      else await db.strokes.bulkPut(entry.strokes);
      for (const s of entry.strokes) await queueSync("strokes", s.id, fwd ? "delete" : "put");
      clearPathCache(entry.strokes.map((s) => s.id));
      break;
    case "addBlock":
      if (fwd) await db.blocks.put(entry.block);
      else await db.blocks.delete(entry.block.id);
      await queueSync("blocks", entry.block.id, fwd ? "put" : "delete");
      break;
    case "deleteBlock":
      if (fwd) await db.blocks.delete(entry.block.id);
      else await db.blocks.put(entry.block);
      await queueSync("blocks", entry.block.id, fwd ? "delete" : "put");
      break;
    case "updateBlock":
      await db.blocks.put(fwd ? entry.after : entry.before);
      await queueSync("blocks", entry.after.id, "put");
      break;
    case "duplicatePage":
    case "deletePage": {
      // deletePage is duplicatePage mirrored: its redo REMOVES the page.
      const insert = entry.kind === "duplicatePage" ? fwd : !fwd;
      if (insert) {
        await db.transaction("rw", db.pages, db.strokes, db.blocks, async () => {
          await db.pages
            .where("plannerId").equals(entry.page.plannerId)
            .and((p) => p.index >= entry.page.index && p.id !== entry.page.id)
            .modify((p) => { p.index += 1; });
          await db.pages.put(entry.page);
          await db.strokes.bulkPut(entry.strokes);
          await db.blocks.bulkPut(entry.blocks);
        });
      } else {
        await db.transaction("rw", db.pages, db.strokes, db.blocks, async () => {
          await db.strokes.bulkDelete(entry.strokes.map((s) => s.id));
          await db.blocks.bulkDelete(entry.blocks.map((b) => b.id));
          await db.pages.delete(entry.page.id);
          await db.pages
            .where("plannerId").equals(entry.page.plannerId)
            .and((p) => p.index > entry.page.index)
            .modify((p) => { p.index -= 1; });
        });
      }
      await queueSync("pages", entry.page.id, insert ? "put" : "delete");
      break;
    }
  }
}

export async function undo() {
  const i = lastActiveIndex(undoStack);
  if (i < 0) return;
  const [scoped] = undoStack.splice(i, 1);
  await apply(scoped.entry, "undo");
  redoStack.push(scoped);
  notify();
}

export async function redo() {
  const i = lastActiveIndex(redoStack);
  if (i < 0) return;
  const [scoped] = redoStack.splice(i, 1);
  await apply(scoped.entry, "redo");
  undoStack.push(scoped);
  notify();
}
