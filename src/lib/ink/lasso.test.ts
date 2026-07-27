import { describe, expect, it } from "vitest";
import type { Stroke } from "@/lib/db/types";
import { pointInPolygon, strokesInPolygon } from "./select";

const mkStroke = (id: string, pts: [number, number][]): Stroke => ({
  id,
  pageId: "pg",
  tool: "pen",
  color: "#000",
  width: 1,
  opacity: 1,
  points: pts.map(([x, y]) => [x, y, 0.5] as [number, number, number]),
  createdAt: 0,
});

// L-shaped (concave) polygon: big square minus its top-right quadrant
const L: [number, number][] = [
  [0, 0], [50, 0], [50, 50], [100, 50], [100, 100], [0, 100],
];

describe("pointInPolygon", () => {
  it("handles concave shapes", () => {
    expect(pointInPolygon([25, 25], L)).toBe(true); // top-left quadrant
    expect(pointInPolygon([75, 75], L)).toBe(true); // bottom-right
    expect(pointInPolygon([75, 25], L)).toBe(false); // the notch
    expect(pointInPolygon([150, 50], L)).toBe(false); // outside
  });
});

describe("strokesInPolygon (lasso membership)", () => {
  it("selects majority-inside strokes, skips notch strokes", () => {
    const inside = mkStroke("in", [[10, 60], [20, 70], [30, 80]]);
    const notch = mkStroke("notch", [[70, 10], [80, 20], [90, 30]]);
    const straddle = mkStroke("straddle", [[40, 60], [60, 60], [45, 65]]); // 2/3 inside
    expect(strokesInPolygon([inside, notch, straddle], L)).toEqual(["in", "straddle"]);
  });

  it("center-inside rescues a big stroke lassoed at its middle", () => {
    // most points outside, but the bbox center (50,75) is inside the L
    const big = mkStroke("big", [[-40, 75], [50, 75], [140, 75], [-40, 74], [140, 76]]);
    expect(strokesInPolygon([big], L)).toEqual(["big"]);
  });
});
