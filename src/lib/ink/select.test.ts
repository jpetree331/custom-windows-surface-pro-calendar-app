import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import type { Stroke } from "@/lib/db/types";
import { computeAreaSelection, strokesInRect } from "./select";
import { formatTime } from "@/lib/settings";

const stroke = (id: string, points: [number, number][]): Stroke => ({
  id,
  pageId: "p",
  tool: "pen",
  color: "#000",
  width: 1,
  opacity: 1,
  points: points.map(([x, y]) => [x, y, 0.5] as [number, number, number]),
  createdAt: 1,
});

describe("strokesInRect (line-aware handwriting selection)", () => {
  // Jo's scenario: target line at y≈100, neighbor line at y≈130 whose
  // descender dips up into the selection box.
  const targetLetter = stroke("target", [[100, 95], [110, 100], [120, 105], [130, 98]]);
  const neighborWithTail = stroke("neighbor", [
    [105, 130], [110, 132], [115, 128], [112, 112], // one point dips into the box
  ]);
  const box = { x: 90, y: 85, w: 60, h: 30 }; // covers y 85–115

  it("captures the whole target letter but not the neighbor's stray tail", () => {
    const ids = strokesInRect([targetLetter, neighborWithTail], box);
    expect(ids).toEqual(["target"]);
  });

  it("captures a big letter when the box covers its center (small box case)", () => {
    const bigLetter = stroke("big", [[80, 60], [100, 100], [120, 140], [100, 100]]);
    const smallBox = { x: 90, y: 90, w: 20, h: 20 }; // only center region
    expect(strokesInRect([bigLetter], smallBox)).toEqual(["big"]);
  });

  it("still selects strokes fully inside", () => {
    const inside = stroke("in", [[95, 90], [100, 95]]);
    expect(strokesInRect([inside], box)).toEqual(["in"]);
  });
});

describe("computeAreaSelection (marquee + resize handles)", () => {
  it("re-captures strokes and blocks for a given rect from the db", async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.strokes.bulkAdd([
      stroke("in1", [[100, 100], [120, 110]]),
      stroke("out1", [[500, 500], [520, 510]]),
    ]);
    await db.blocks.bulkAdd([
      { id: "bIn", pageId: "p", type: "text", x: 90, y: 90, w: 50, h: 30, z: 1, content: "x", createdAt: 1, updatedAt: 1 },
      { id: "bOut", pageId: "p", type: "text", x: 700, y: 700, w: 50, h: 30, z: 1, content: "y", createdAt: 1, updatedAt: 1 },
    ]);
    const sel = await computeAreaSelection("p", { x: 80, y: 80, w: 100, h: 80 });
    expect(sel.strokeIds).toEqual(["in1"]);
    expect(sel.blockIds).toEqual(["bIn"]);
    // grow the rect (what a handle-drag does) → captures more
    const bigger = await computeAreaSelection("p", { x: 80, y: 80, w: 700, h: 700 });
    expect(bigger.strokeIds.sort()).toEqual(["in1", "out1"]);
    expect(bigger.blockIds.sort()).toEqual(["bIn", "bOut"]);
  });
});

describe("formatTime", () => {
  it("converts 24h to AM/PM and respects 24h mode", () => {
    expect(formatTime("14:00", "12h")).toBe("2:00 PM");
    expect(formatTime("00:05", "12h")).toBe("12:05 AM");
    expect(formatTime("12:30", "12h")).toBe("12:30 PM");
    expect(formatTime("09:15", "12h")).toBe("9:15 AM");
    expect(formatTime("14:00", "24h")).toBe("14:00");
    expect(formatTime(undefined, "12h")).toBeUndefined();
  });
});
