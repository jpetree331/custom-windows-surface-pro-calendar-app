import { describe, expect, it } from "vitest";
import { clampChipOffset } from "./layout";

const cell = { w: 200, h: 100 };
const chip = { w: 50, h: 10 }; // 25% × 10% of the cell

describe("clampChipOffset (chip drag stays inside its day)", () => {
  it("converts a pixel delta to cell %", () => {
    const p = clampChipOffset(cell, chip, { x: 0, y: 0 }, 20, 10);
    expect(p).toEqual({ x: 10, y: 10 });
  });

  it("clamps so the chip never leaves the cell", () => {
    const p = clampChipOffset(cell, chip, { x: 50, y: 50 }, 1000, 1000);
    expect(p).toEqual({ x: 75, y: 90 }); // 100 − chip%,
    const q = clampChipOffset(cell, chip, { x: 50, y: 50 }, -1000, -1000);
    expect(q).toEqual({ x: 0, y: 0 });
  });

  it("a chip wider than the cell pins at 0", () => {
    const p = clampChipOffset(cell, { w: 300, h: 10 }, { x: 0, y: 0 }, 50, 0);
    expect(p.x).toBe(0);
  });
});
