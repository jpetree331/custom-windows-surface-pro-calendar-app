import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { createNote, deleteNote, noteDisplayTitle } from "./actions";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("notes", () => {
  it("deleting a note removes its ink and text too (pageId = note id)", async () => {
    const note = await createNote(101);
    await db.strokes.add({
      id: "ns1", pageId: note.id, tool: "pen", color: "#000", width: 1, opacity: 1,
      points: [[1, 1, 0.5]], createdAt: 1,
    });
    await db.blocks.add({
      id: "nb1", pageId: note.id, type: "text", x: 0, y: 0, w: 10, h: 10, z: 1,
      content: "milk", createdAt: 1, updatedAt: 1,
    });
    await deleteNote(note.id);
    expect(await db.notes.count()).toBe(0);
    expect(await db.strokes.where("pageId").equals(note.id).count()).toBe(0);
    expect(await db.blocks.where("pageId").equals(note.id).count()).toBe(0);
  });

  it("blank titles derive from the first line of text, else Note N", async () => {
    const n = await createNote(102);
    expect(noteDisplayTitle(n, "buy milk\nand eggs", 0)).toBe("buy milk");
    expect(noteDisplayTitle(n, undefined, 2)).toBe("Note 3");
    expect(noteDisplayTitle({ ...n, title: "Groceries" }, "buy milk", 0)).toBe("Groceries");
  });
});
