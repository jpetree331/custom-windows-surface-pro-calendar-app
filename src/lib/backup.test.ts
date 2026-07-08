import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { buildPages } from "@/lib/planner/generate";
import { createBackup, restoreBackup } from "./backup";

const PLANNER_ID = "backup-planner";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function seed() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.planners.add({
    id: PLANNER_ID, year: 2026, title: "Jo's Planner '26",
    settings: {}, createdAt: 1, updatedAt: 1,
  });
  const pages = buildPages(PLANNER_ID, 2026);
  await db.pages.bulkAdd(pages);
  const wk = pages.find((p) => p.type === "week")!;
  await db.strokes.add({
    id: "s1", pageId: wk.id, tool: "pen", color: "#29abe2", width: 1, opacity: 1,
    points: [[10, 10, 0.5], [50, 40, 0.7]], createdAt: 1,
  });
  await db.blocks.bulkAdd([
    { id: "b1", pageId: wk.id, type: "text", x: 1, y: 2, w: 100, h: 40, z: 1, content: "hello", createdAt: 1, updatedAt: 1 },
    {
      id: "b2", pageId: wk.id, type: "image", x: 5, y: 6, w: 60, h: 40, z: 2, content: "",
      imageBlob: new Blob([PNG_BYTES], { type: "image/png" }), createdAt: 1, updatedAt: 1,
    },
  ]);
  await db.habits.add({ id: "h1", plannerId: PLANNER_ID, name: "Walk", cadence: "daily", order: 0, active: true });
  await db.habitChecks.add({ id: "c1", habitId: "h1", date: "2026-07-08", checked: true });
  await db.categories.add({ id: "cat1", plannerId: PLANNER_ID, name: "Fun", color: "#8348c9", order: 0 });
  await db.events.add({
    id: "e1", plannerId: PLANNER_ID, kind: "event", title: "Dentist",
    date: "2026-07-08", allDay: true, updatedAt: 1,
  });
}

beforeEach(seed);

describe("backup round-trip", () => {
  it("restores everything — including image bytes — after a total wipe", async () => {
    const blob = await createBackup();
    const json = await blob.text();

    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await db.pages.count()).toBe(0);

    const { restored } = await restoreBackup(json);
    expect(restored.pages).toBe(79);
    expect(restored.strokes).toBe(1);
    expect(restored.blocks).toBe(2);
    expect(restored.habitChecks).toBe(1);

    const img = await db.blocks.get("b2");
    const bytes = new Uint8Array(await img!.imageBlob!.arrayBuffer());
    expect([...bytes]).toEqual([...PNG_BYTES]);
    expect((await db.strokes.get("s1"))!.points).toEqual([[10, 10, 0.5], [50, 40, 0.7]]);
    expect((await db.habitChecks.get("c1"))!.checked).toBe(true);
  });

  it("restore is a merge: never deletes newer work", async () => {
    const json = await (await createBackup()).text();
    // New work created AFTER the backup...
    await db.blocks.add({
      id: "b3", pageId: "whatever", type: "text", x: 0, y: 0, w: 10, h: 10, z: 1,
      content: "newer note", createdAt: 2, updatedAt: 2,
    });
    await restoreBackup(json);
    // ...survives the restore.
    expect((await db.blocks.get("b3"))?.content).toBe("newer note");
    expect(await db.blocks.count()).toBe(3);
  });

  it("rejects files that are not planner backups", async () => {
    await expect(restoreBackup(JSON.stringify({ hello: 1 }))).rejects.toThrow(/Not a Jo's Planner backup/);
    await expect(restoreBackup(JSON.stringify({ format: "jotter-backup", version: 99, tables: {} })))
      .rejects.toThrow(/newer app version/);
  });
});
