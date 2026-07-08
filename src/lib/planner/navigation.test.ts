import { describe, expect, it } from "vitest";
import { buildPages } from "./generate";
import { currentWeekPageIndex } from "./navigation";

describe("currentWeekPageIndex (the ✱ Current Week button)", () => {
  const pages = buildPages("p1", 2026);
  const weekAt = (i: number) => pages[i];

  it("rolls over automatically at the Monday boundary", () => {
    // Sunday Jul 12 → week Jul 6–12
    const sunday = currentWeekPageIndex(pages, "2026-07-12");
    expect(weekAt(sunday).dateStart).toBe("2026-07-06");
    // Next day (Monday Jul 13) → week Jul 13–19, no refresh needed
    const monday = currentWeekPageIndex(pages, "2026-07-13");
    expect(weekAt(monday).dateStart).toBe("2026-07-13");
    expect(monday).toBe(sunday + 1);
  });

  it("rolls over at month boundaries too (weeks interleave with month pages)", () => {
    const julyEnd = currentWeekPageIndex(pages, "2026-08-02"); // Sun of Jul 27 week
    expect(weekAt(julyEnd).dateStart).toBe("2026-07-27");
    const augStart = currentWeekPageIndex(pages, "2026-08-03"); // Mon
    expect(weekAt(augStart).dateStart).toBe("2026-08-03");
    // An AUGUST month page sits between those two week pages.
    expect(augStart).toBe(julyEnd + 2);
    expect(pages[julyEnd + 1].type).toBe("month");
  });

  it("clamps to the first/last week outside the planner year", () => {
    const before = currentWeekPageIndex(pages, "2025-06-01");
    expect(weekAt(before).dateStart).toBe("2025-12-29"); // week 1
    const after = currentWeekPageIndex(pages, "2027-06-01");
    expect(weekAt(after).dateEnd).toBe("2027-01-03"); // week 53
  });

  it("covers every day of 2026 with no gaps", () => {
    for (const iso of ["2026-01-01", "2026-02-28", "2026-06-15", "2026-12-31"]) {
      const i = currentWeekPageIndex(pages, iso);
      expect(pages[i].type).toBe("week");
      expect(pages[i].dateStart <= iso && iso <= pages[i].dateEnd).toBe(true);
    }
  });
});
