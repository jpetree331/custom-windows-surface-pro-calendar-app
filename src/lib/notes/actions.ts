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
  // Jo r11: "the whole note is a textbox" — every note starts with a
  // full-width body text block that focuses on open. The pen still draws
  // over it (ink canvas sits above; typing resumes on tap).
  const body = {
    id: crypto.randomUUID(),
    pageId: note.id,
    type: "text" as const,
    x: 25,
    y: 25,
    w: 950,
    h: 420,
    z: 1,
    content: "",
    fontSize: 18,
    createdAt: now,
    updatedAt: now,
  };
  await db.blocks.add(body);
  await queueSync("blocks", body.id, "put");
  return note;
}

/** Reorder for the Notes menu's "Custom" sort. Deliberately does NOT bump
 *  updatedAt — arranging notes must not scramble the "Recent" sort. */
export async function moveNote(id: string, dir: 1 | -1) {
  const sorted = (await db.notes.toArray()).sort(
    (a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)
  );
  const i = sorted.findIndex((n) => n.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  // swap only the two neighbors' effective orders — 2 writes, not N
  const [a, b] = [sorted[i], sorted[j]];
  await db.notes.update(a.id, { order: b.order ?? b.createdAt });
  await db.notes.update(b.id, { order: a.order ?? a.createdAt });
  await queueSync("notes", a.id, "put");
  await queueSync("notes", b.id, "put");
}

/** Content-ish updates (title): bumps updatedAt so "Recent" reflects it. */
export async function updateNote(id: string, patch: Partial<Note>) {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
  await queueSync("notes", id, "put");
}

/** Window-chrome updates (position/size/z/open): deliberately does NOT bump
 *  updatedAt — clicking a note to the front or dragging its window must not
 *  reshuffle the menu's "Recent" sort (bugs review, r11). */
export async function updateNoteChrome(id: string, patch: Partial<Note>) {
  await db.notes.update(id, patch);
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

