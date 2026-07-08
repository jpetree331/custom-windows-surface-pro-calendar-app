import { describe, expect, it } from "vitest";
import { weeksOfYear, mondayOf, toISO, firstDowOfMonth, daysInMonth } from "./dates";

describe("weeksOfYear(2026)", () => {
  const weeks = weeksOfYear(2026);

  it("yields 53 Monday-start weeks (2026 starts on a Thursday)", () => {
    expect(weeks).toHaveLength(53);
  });

  it("week 1 contains Jan 1 2026", () => {
    expect(toISO(weeks[0].start)).toBe("2025-12-29");
    expect(toISO(weeks[0].end)).toBe("2026-01-04");
  });

  it("last week contains Dec 31 2026", () => {
    const last = weeks[weeks.length - 1];
    expect(toISO(last.start)).toBe("2026-12-28");
    expect(toISO(last.end)).toBe("2027-01-03");
  });

  it("weeks are contiguous with no gaps", () => {
    for (let i = 1; i < weeks.length; i++) {
      const prevEnd = weeks[i - 1].end;
      const next = new Date(prevEnd);
      next.setDate(next.getDate() + 1);
      expect(toISO(weeks[i].start)).toBe(toISO(next));
    }
  });

  it("assigns each week to the month of its Thursday", () => {
    // Jun 29 – Jul 5 2026: Thursday Jul 2 → July (month 6)
    const w = weeks.find((w) => toISO(w.start) === "2026-06-29")!;
    expect(w.monthIndex).toBe(6);
  });
});

describe("calendar math", () => {
  it("mondayOf returns the same day for a Monday", () => {
    expect(toISO(mondayOf(new Date(2026, 6, 6)))).toBe("2026-07-06");
  });
  it("mondayOf rolls a Sunday back six days", () => {
    expect(toISO(mondayOf(new Date(2026, 6, 12)))).toBe("2026-07-06");
  });
  it("Jan 1 2026 is a Thursday (dow index 3)", () => {
    expect(firstDowOfMonth(2026, 0)).toBe(3);
  });
  it("Feb 2026 has 28 days", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
  });
});
