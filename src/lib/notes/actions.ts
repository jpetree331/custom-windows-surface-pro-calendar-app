import { db } from "@/lib/db/db";
import type { Note } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";

/** Fresh notes open top-right, about a quarter of the screen (Jo). */
const DEFAULT_RECT = { x: 0.55, y: 0.12, w: 0.28, h: 0.35 };

export async function createNote(z: number): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: crypto.randomUUID(),
    title: "",
    ...DEFAULT_RECT,
    // cascade a little so stacked new notes don't perfectly overlap
    x: Math.min(0.6, DEFAULT_RECT.x + (z % 5) * 0.02),
    y: Math.min(0.4, DEFAULT_RECT.y + (z % 5) * 0.03),
    z,
    open: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.notes.add(note);
  await queueSync("notes", note.id, "put");
  return note;
}

export async function updateNote(id: string, patch: Partial<Note>) {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
  await queueSync("notes", id, "put");
}

/** Delete the note AND its ink/text (strokes/blocks keyed by pageId = id). */
export async function deleteNote(id: string) {
  await db.transaction("rw", db.notes, db.strokes, db.blocks, async () => {
    await db.notes.delete(id);
    await db.strokes.where("pageId").equals(id).delete();
    await db.blocks.where("pageId").equals(id).delete();
  });
  await queueSync("notes", id, "delete");
}

/** Display title: typed title, else the first line of the first text block,
 *  else a numbered fallback. */
export function noteDisplayTitle(note: Note, firstBlockText: string | undefined, index: number): string {
  if (note.title.trim()) return note.title.trim();
  const line = (firstBlockText ?? "").split("\n").find((l) => l.trim());
  return line?.trim().slice(0, 40) || `Note ${index + 1}`;
}

