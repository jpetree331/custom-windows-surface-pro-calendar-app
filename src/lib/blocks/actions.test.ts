import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { buildPages } from "@/lib/planner/generate";
import type { Page, Stroke } from "@/lib/db/types";
import {
  addBlock,
  carryTaskForward,
  duplicatePage,
  makeTextBlock,
  addStroke,
  deleteStrokes,
} from "./actions";
import * as history from "@/lib/history";

const PLANNER_ID = "test-planner";

async function seed(): Promise<Page[]> {
  await Promise.all(db.tables.map((t) => t.clear()));
  const pages = buildPages(PLANNER_ID, 2026);
  await db.pages.bulkAdd(pages);
  return pages;
}

function fakeStroke(pageId: string, i: number): Stroke {
  return {
    id: crypto.randomUUID(),
    pageId,
    tool: "pen",
    color: "#29abe2",
    width: 1,
    opacity: 1,
    points: Array.from({ length: 40 }, (_, j) => [i * 3 + j, i * 2, 0.5]),
    createdAt: Date.now(),
  };
}

describe("buildPages", () => {
  it("produces exactly 79 pages: 1 year + 12 months + 53 weeks + 13 sections", async () => {
    const pages = await seed();
    expect(pages).toHaveLength(79);
    const by = (t: string) => pages.filter((p) => p.type === t).length;
    expect([by("year"), by("month"), by("week"), by("section")]).toEqual([1, 12, 53, 13]);
  });

  it("orders pages year → month → its weeks → sections with contiguous indexes", async () => {
    const pages = await seed();
    expect(pages.map((p) => p.index)).toEqual(pages.map((_, i) => i));
    expect(pages[0].type).toBe("year");
    expect(pages[1].label).toBe("JANUARY");
    expect(pages[2].type).toBe("week");
    const janWeeks = pages.filter((p) => p.type === "week" && p.monthIndex === 0);
    expect(janWeeks.every((w) => w.index > pages[1].index)).toBe(true);
  });
});

describe("carryTaskForward", () => {
  beforeEach(seed);

  it("copies an unfinished task to the following week's page", async () => {
    const pages = await db.pages.toArray();
    const wk28 = pages.find((p) => p.dateStart === "2026-07-06")!;
    const wk29 = pages.find((p) => p.dateStart === "2026-07-13")!;
    const task = makeTextBlock(wk28.id, 100, 100, "water the plants", "task");
    await addBlock(task);

    const target = await carryTaskForward(task);
    expect(target?.id).toBe(wk29.id);
    const carried = await db.blocks.where("pageId").equals(wk29.id).toArray();
    expect(carried).toHaveLength(1);
    expect(carried[0].content).toBe("water the plants");
    expect(carried[0].checked).toBe(false);
    expect(carried[0].id).not.toBe(task.id);
  });

  it("does nothing for a non-week page", async () => {
    const pages = await db.pages.toArray();
    const year = pages.find((p) => p.type === "year")!;
    const task = makeTextBlock(year.id, 0, 0, "x", "task");
    await addBlock(task);
    expect(await carryTaskForward(task)).toBeNull();
  });
});

describe("duplicatePage", () => {
  beforeEach(seed);

  it("clones a heavily-inked page instantly (300 strokes) and keeps indexes contiguous", async () => {
    const pages = await db.pages.toArray();
    const wk = pages.find((p) => p.dateStart === "2026-07-06")!;
    await db.strokes.bulkAdd(Array.from({ length: 300 }, (_, i) => fakeStroke(wk.id, i)));
    await db.blocks.bulkAdd([makeTextBlock(wk.id, 10, 10, "hello")]);

    const t0 = performance.now();
    const copy = await duplicatePage(wk.id);
    const ms = performance.now() - t0;

    expect(copy).not.toBeNull();
    expect(ms).toBeLessThan(500); // "instant" — the Drawboard failure case
    const all = await db.pages.toArray();
    expect(all).toHaveLength(80);
    const sorted = [...all].sort((a, b) => a.index - b.index);
    expect(sorted.map((p) => p.index)).toEqual(sorted.map((_, i) => i));
    expect(sorted[wk.index + 1].id).toBe(copy!.id);
    expect(await db.strokes.where("pageId").equals(copy!.id).count()).toBe(300);
    expect(await db.blocks.where("pageId").equals(copy!.id).count()).toBe(1);
  });

  it("undo removes the duplicate and restores indexes; redo re-applies", async () => {
    const pages = await db.pages.toArray();
    const wk = pages.find((p) => p.dateStart === "2026-07-06")!;
    await db.strokes.bulkAdd([fakeStroke(wk.id, 1)]);
    const copy = await duplicatePage(wk.id);

    await history.undo();
    expect(await db.pages.count()).toBe(79);
    expect(await db.strokes.where("pageId").equals(copy!.id).count()).toBe(0);
    let sorted = (await db.pages.toArray()).sort((a, b) => a.index - b.index);
    expect(sorted.map((p) => p.index)).toEqual(sorted.map((_, i) => i));

    await history.redo();
    expect(await db.pages.count()).toBe(80);
    expect(await db.strokes.where("pageId").equals(copy!.id).count()).toBe(1);
    sorted = (await db.pages.toArray()).sort((a, b) => a.index - b.index);
    expect(sorted.map((p) => p.index)).toEqual(sorted.map((_, i) => i));
  });
});

describe("stroke history", () => {
  beforeEach(seed);

  it("undo/redo of add and erase round-trips", async () => {
    const pages = await db.pages.toArray();
    const wk = pages.find((p) => p.type === "week")!;
    const s = fakeStroke(wk.id, 1);
    await addStroke(s);
    expect(await db.strokes.count()).toBe(1);
    await deleteStrokes([s]);
    expect(await db.strokes.count()).toBe(0);
    await history.undo(); // un-erase
    expect(await db.strokes.count()).toBe(1);
    await history.undo(); // un-add
    expect(await db.strokes.count()).toBe(0);
    await history.redo(); // re-add
    expect(await db.strokes.count()).toBe(1);
    await history.redo(); // re-erase
    expect(await db.strokes.count()).toBe(0);
  });
});
