import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { addHabit, checkDate, deleteHabit, renameHabit, toggleHabitCheck } from "./actions";
import {
  addCategory,
  deleteCategory,
  ensureStarterCategories,
  updateCategory,
} from "@/lib/categories/actions";
import { makeTextBlock } from "@/lib/blocks/actions";

const PLANNER_ID = "p1";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("habits", () => {
  it("daily habit checks persist per date and toggle on/off", async () => {
    const h = await addHabit(PLANNER_ID, "Water", "daily");
    expect(await toggleHabitCheck(h, "2026-07-08")).toBe(true);
    expect(await toggleHabitCheck(h, "2026-07-09")).toBe(true);
    expect(await toggleHabitCheck(h, "2026-07-08")).toBe(false); // untoggle
    const rows = await db.habitChecks.toArray();
    expect(rows.find((r) => r.date === "2026-07-08")?.checked).toBe(false);
    expect(rows.find((r) => r.date === "2026-07-09")?.checked).toBe(true);
  });

  it("weekly habit checks collapse to the week's Monday", async () => {
    const h = await addHabit(PLANNER_ID, "Meal prep", "weekly");
    expect(checkDate(h, "2026-07-08")).toBe("2026-07-06"); // Wed → Mon
    expect(checkDate(h, "2026-07-12")).toBe("2026-07-06"); // Sun → same Mon
    await toggleHabitCheck(h, "2026-07-08");
    // Toggling from another weekday of the same week flips the SAME check.
    expect(await toggleHabitCheck(h, "2026-07-12")).toBe(false);
    expect(await db.habitChecks.count()).toBe(1);
  });

  it("rename and delete (checks cascade)", async () => {
    const h = await addHabit(PLANNER_ID, "Read", "daily");
    await renameHabit(h.id, "Read 10 pages");
    expect((await db.habits.get(h.id))?.name).toBe("Read 10 pages");
    await toggleHabitCheck(h, "2026-07-08");
    await deleteHabit(h.id);
    expect(await db.habits.count()).toBe(0);
    expect(await db.habitChecks.count()).toBe(0);
  });
});

describe("categories", () => {
  it("seeds Jo's 7 starters once, idempotently", async () => {
    await ensureStarterCategories(PLANNER_ID);
    await ensureStarterCategories(PLANNER_ID);
    const cats = await db.categories.where("plannerId").equals(PLANNER_ID).sortBy("order");
    expect(cats).toHaveLength(7);
    expect(cats[0]).toMatchObject({ name: "Appointments", color: "#3DC9FD" });
    expect(cats[6]).toMatchObject({ name: "Misc.", color: "#000000" });
  });

  it("upgrades an untouched legacy starter set, but never touches edited ones", async () => {
    // simulate a device seeded before Jo's palette existed
    const legacy = [
      { name: "Family", color: "#3fa9f5" }, { name: "Business", color: "#6dbb3c" },
      { name: "Health", color: "#f2599a" }, { name: "Home", color: "#f28d49" },
      { name: "Fun", color: "#8348c9" },
    ];
    await db.categories.bulkAdd(legacy.map((s, i) => ({
      id: `legacy${i}`, plannerId: PLANNER_ID, name: s.name, color: s.color, order: i,
    })));
    await ensureStarterCategories(PLANNER_ID);
    const cats = await db.categories.where("plannerId").equals(PLANNER_ID).toArray();
    expect(cats).toHaveLength(7);
    expect(cats.some((c) => c.name === "Appointments")).toBe(true);

    // edited sets are left alone
    await db.categories.clear();
    await db.categories.add({ id: "mine", plannerId: PLANNER_ID, name: "My Thing", color: "#111111", order: 0 });
    await ensureStarterCategories(PLANNER_ID);
    expect(await db.categories.where("plannerId").equals(PLANNER_ID).count()).toBe(1);
  });

  it("add / rename / recolor propagate; delete untags blocks", async () => {
    const cat = await addCategory(PLANNER_ID, "Errands", "#123456");
    await updateCategory(cat.id, { name: "Chores", color: "#654321" });
    const updated = await db.categories.get(cat.id);
    expect(updated?.name).toBe("Chores");
    expect(updated?.color).toBe("#654321");

    const block = { ...makeTextBlock("page1", 0, 0, "tagged"), categoryId: cat.id };
    await db.blocks.add(block);
    await deleteCategory(cat.id);
    expect(await db.categories.get(cat.id)).toBeUndefined();
    expect((await db.blocks.get(block.id))?.categoryId).toBeUndefined();
  });
});
