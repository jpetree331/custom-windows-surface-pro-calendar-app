import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import * as history from "@/lib/history";
import { recolorSelectionContents, scaleSelectionContents } from "./actions";
import type { Block, Stroke } from "@/lib/db/types";

const PAGE = "pg1";

const stroke: Stroke = {
  id: "s1", pageId: PAGE, tool: "pen", color: "#111111", width: 2, opacity: 1,
  points: [
    [100, 100, 0.5],
    [200, 100, 0.7],
    [200, 200, 0.5],
  ],
  createdAt: 1,
};
const block: Block = {
  id: "b1", pageId: PAGE, type: "text", x: 100, y: 100, w: 100, h: 50, z: 1,
  content: "hi", fontSize: 10, createdAt: 1, updatedAt: 1,
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  history.setActivePlanner("test-planner");
  await db.strokes.add(stroke);
  await db.blocks.add(block);
});

const sel = { pageId: PAGE, strokeIds: ["s1"], blockIds: ["b1"] };

describe("scaleSelectionContents (resize selected handwriting)", () => {
  it("maps points and block geometry from base→target, scaling width/font", async () => {
    const base = { x: 100, y: 100, w: 100, h: 100 };
    const target = { x: 100, y: 100, w: 200, h: 200 }; // uniform 2×
    await scaleSelectionContents(sel, base, target);
    const s = (await db.strokes.get("s1"))!;
    expect(s.points[0]).toEqual([100, 100, 0.5]); // anchor corner fixed
    expect(s.points[1].slice(0, 2)).toEqual([300, 100]);
    expect(s.points[2].slice(0, 2)).toEqual([300, 300]);
    expect(s.points[1][2]).toBe(0.7); // pressure untouched
    expect(s.width).toBeCloseTo(4); // 2 × geometric-mean factor 2
    const b = (await db.blocks.get("b1"))!;
    expect(b).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });
    expect(b.fontSize).toBe(20);
  });

  it("membership is frozen — one undo restores everything exactly", async () => {
    const base = { x: 100, y: 100, w: 100, h: 100 };
    await scaleSelectionContents(sel, base, { x: 50, y: 50, w: 300, h: 150 });
    await history.undo();
    const s = (await db.strokes.get("s1"))!;
    expect(s.points).toEqual(stroke.points);
    expect(s.width).toBe(2);
    const b = (await db.blocks.get("b1"))!;
    expect(b).toMatchObject({ x: 100, y: 100, w: 100, h: 50, fontSize: 10 });
  });

  it("clamps font size and stroke width into their UI ranges", async () => {
    const base = { x: 100, y: 100, w: 100, h: 100 };
    await scaleSelectionContents(sel, base, { x: 100, y: 100, w: 1000, h: 1000 });
    expect((await db.blocks.get("b1"))!.fontSize).toBe(28); // UI max
    expect((await db.strokes.get("s1"))!.width).toBeLessThanOrEqual(8);
  });
});

describe("recolorSelectionContents (recolor selected handwriting)", () => {
  it("recolors strokes + text blocks in one undoable step", async () => {
    await recolorSelectionContents(sel, "#ff0000");
    expect((await db.strokes.get("s1"))!.color).toBe("#ff0000");
    expect((await db.blocks.get("b1"))!.color).toBe("#ff0000");
    await history.undo();
    expect((await db.strokes.get("s1"))!.color).toBe("#111111");
    expect((await db.blocks.get("b1"))!.color).toBeUndefined();
  });

  it("skips image blocks", async () => {
    await db.blocks.add({ ...block, id: "img1", type: "image", content: "" });
    await recolorSelectionContents(
      { ...sel, blockIds: ["b1", "img1"] },
      "#00ff00"
    );
    expect((await db.blocks.get("img1"))!.color).toBeUndefined();
  });
});
