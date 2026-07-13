import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { buildPages, ensurePlannerSeeded } from "./generate";
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

describe("duplicated pages never steal date-based navigation", () => {
  it("✱ targets the original week even when a copy sits earlier in the feed", async () => {
    const base = buildPages("pnav", 2026);
    const wkIdx = base.findIndex((p) => p.dateStart === "2026-07-06");
    const copy = {
      ...base[wkIdx],
      id: "copy1",
      index: wkIdx, // copy placed BEFORE the original
      meta: { ...base[wkIdx].meta, isCopy: true },
    };
    const withCopy = [...base.slice(0, wkIdx), copy, ...base.slice(wkIdx)].map((p, i) => ({
      ...p,
      index: i,
    }));
    const i = currentWeekPageIndex(withCopy, "2026-07-08");
    expect(withCopy[i].id).toBe(base[wkIdx].id); // original wins
    expect(withCopy[i].meta.isCopy).toBeUndefined();
  });
});

describe("multi-year rollover (Start 2027)", () => {
  it("first-ever planner atomically seeds Jo's starter categories", async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    const p26 = await ensurePlannerSeeded(2026);
    const cats = await db.categories.where("plannerId").equals(p26.id).sortBy("order");
    expect(cats).toHaveLength(7);
    expect(cats[0].name).toBe("Appointments");
  });

  it("creates the next year's planner with correct week structure and inherits categories + active habits", async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    const p26 = await ensurePlannerSeeded(2026);
    // simulate Jo having customized 2026 down to a single category
    await db.categories.where("plannerId").equals(p26.id).delete();
    await db.categories.add({ id: "c1", plannerId: p26.id, name: "Appointments", color: "#3DC9FD", order: 0 });
    await db.habits.bulkAdd([
      { id: "h1", plannerId: p26.id, name: "Walk", cadence: "daily", order: 0, active: true },
      { id: "h2", plannerId: p26.id, name: "Old", cadence: "daily", order: 1, active: false },
    ]);

    const p27 = await ensurePlannerSeeded(2027);
    expect(p27.year).toBe(2027);
    expect(p27.id).not.toBe(p26.id);

    const pages27 = await db.pages.where("plannerId").equals(p27.id).sortBy("index");
    // 2027 starts on a Friday → 52 ISO weeks → 78 pages
    expect(pages27.filter((p) => p.type === "week")).toHaveLength(52);
    // Jan 1 2027 falls in 2026's ISO week 53, so 2027's week 1 starts Jan 4
    const w1 = pages27.find((p) => p.type === "week")!;
    expect(w1.dateStart).toBe("2027-01-04");

    // inherited setup: categories copied, only ACTIVE habits carried over
    const cats27 = await db.categories.where("plannerId").equals(p27.id).toArray();
    expect(cats27.map((c) => c.name)).toEqual(["Appointments"]);
    const habits27 = await db.habits.where("plannerId").equals(p27.id).toArray();
    expect(habits27.map((h) => h.name)).toEqual(["Walk"]);

    // idempotent: calling again neither duplicates pages nor re-copies
    const again = await ensurePlannerSeeded(2027);
    expect(again.id).toBe(p27.id);
    expect(await db.pages.where("plannerId").equals(p27.id).count()).toBe(pages27.length);
    expect(await db.habits.where("plannerId").equals(p27.id).count()).toBe(1);

    // 2026 planner untouched
    expect(await db.pages.where("plannerId").equals(p26.id).count()).toBe(79);
  });
});
