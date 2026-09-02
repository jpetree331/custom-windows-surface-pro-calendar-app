import { describe, expect, it } from "vitest";
import { clampChipOffset, sortDayEvents } from "./layout";

describe("sortDayEvents (Jo r14: birthdays, appointments, tasks)", () => {
  it("orders by kind, then clock time, then title", () => {
    const rows = [
      { kind: "reminder" as const, title: "Buy stamps" },
      { kind: "event" as const, title: "Dentist", startTime: "14:00" },
      { kind: "notice" as const, title: "🔔 Vet (in 2d)" },
      { kind: "event" as const, title: "Choir", startTime: "09:30" },
      { kind: "birthday" as const, title: "Mum" },
      { kind: "event" as const, title: "Bin day" }, // all-day → before timed
      { kind: "birthday" as const, title: "Alex" },
    ];
    expect(sortDayEvents(rows).map((r) => r.title)).toEqual([
      "Alex", "Mum", "Bin day", "Choir", "Dentist", "Buy stamps", "🔔 Vet (in 2d)",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [{ kind: "event" as const, title: "b" }, { kind: "birthday" as const, title: "a" }];
    sortDayEvents(rows);
    expect(rows[0].title).toBe("b");
  });
});

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
