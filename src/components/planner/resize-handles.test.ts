import { describe, expect, it } from "vitest";
import { isCornerHandle, resizeRect, resizeRectAspectLocked } from "./resize-handles";

const base = { x: 100, y: 100, w: 200, h: 100 }; // 2:1 aspect

describe("isCornerHandle", () => {
  it("corners yes, edges no", () => {
    expect(isCornerHandle({ l: true, t: true })).toBe(true);
    expect(isCornerHandle({ r: true, b: true })).toBe(true);
    expect(isCornerHandle({ r: true })).toBe(false);
    expect(isCornerHandle({ t: true })).toBe(false);
  });
});

describe("resizeRectAspectLocked (Jo: corner drag keeps the scale)", () => {
  it("locks the base aspect ratio on a SE drag", () => {
    const r = resizeRectAspectLocked(base, { r: true, b: true }, 100, 5);
    expect(r.w / r.h).toBeCloseTo(2, 5);
    expect(r.x).toBe(100); // anchored at the un-dragged corner
    expect(r.y).toBe(100);
    expect(r.w).toBeCloseTo(300); // dominant axis (dx) wins
  });

  it("anchors the opposite corner on a NW drag", () => {
    const r = resizeRectAspectLocked(base, { l: true, t: true }, -100, 0);
    expect(r.w / r.h).toBeCloseTo(2, 5);
    // right/bottom edges stay fixed
    expect(r.x + r.w).toBeCloseTo(base.x + base.w);
    expect(r.y + r.h).toBeCloseTo(base.y + base.h);
    expect(r.w).toBeCloseTo(300);
  });

  it("never collapses below the minimum", () => {
    const r = resizeRectAspectLocked(base, { r: true, b: true }, -500, -500, 12, 12);
    expect(r.w).toBeGreaterThanOrEqual(12);
    expect(r.h).toBeGreaterThanOrEqual(12);
    expect(r.w / r.h).toBeCloseTo(2, 5);
  });

  it("edge handles still free-stretch via resizeRect", () => {
    const r = resizeRect(base, { r: true }, 50, 0);
    expect(r).toEqual({ x: 100, y: 100, w: 250, h: 100 });
  });
});
