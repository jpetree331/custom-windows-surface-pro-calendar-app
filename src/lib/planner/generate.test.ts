import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { addBlankPage } from "@/lib/blocks/actions";
import { addSideButton, ensureSideButtonsSeeded } from "./sideButtons";
import { ensurePlannerSeeded } from "./generate";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Jo r13: "when the calendar runs out, roll over to the new year." */
describe("year rollover carries her setup forward", () => {
  it("copies custom pages and side buttons, repointing page targets", async () => {
    const y26 = await ensurePlannerSeeded(2026);
    await ensureSideButtonsSeeded(y26.id);
    const last = (await db.pages.where("plannerId").equals(y26.id).sortBy("index")).at(-1)!;
    const recipes = (await addBlankPage(last.id, "RECIPES"))!;
    await addSideButton(y26.id, { label: "Recipes", glyph: "RCP", target: `page:${recipes.id}` });

    const y27 = await ensurePlannerSeeded(2027);

    const pages27 = await db.pages.where("plannerId").equals(y27.id).sortBy("index");
    const carried = pages27.filter((p) => p.meta.sectionKey === "custom");
    expect(carried.map((p) => p.label)).toEqual(["RECIPES"]);
    expect(carried[0].id).not.toBe(recipes.id); // a copy, not the same row
    expect(carried[0].index).toBe(pages27.length - 1); // still at the back

    const buttons27 = await db.sideButtons.where("plannerId").equals(y27.id).sortBy("order");
    const buttons26 = await db.sideButtons.where("plannerId").equals(y26.id).sortBy("order");
    expect(buttons27.map((b) => b.label)).toEqual(buttons26.map((b) => b.label));
    expect(buttons27.map((b) => b.order)).toEqual(buttons26.map((_, i) => i));
    const recipesBtn = buttons27.find((b) => b.label === "Recipes")!;
    expect(recipesBtn.target).toBe(`page:${carried[0].id}`);
    expect(recipesBtn.glyph).toBe("RCP"); // 3-character names survive (Jo r13)
  });

  it("carries categories and active habits, and never re-runs on reopen", async () => {
    const y26 = await ensurePlannerSeeded(2026);
    await db.categories.bulkAdd([
      { id: "c1", plannerId: y26.id, name: "Choir", color: "#123456", order: 0 },
    ]);
    await db.habits.bulkAdd([
      { id: "h1", plannerId: y26.id, name: "Walk", cadence: "daily", active: true, order: 0 },
      { id: "h2", plannerId: y26.id, name: "Retired", cadence: "weekly", active: false, order: 1 },
    ]);

    const y27 = await ensurePlannerSeeded(2027);
    await ensurePlannerSeeded(2027); // reopening must not duplicate anything

    const cats26 = await db.categories.where("plannerId").equals(y26.id).toArray();
    const cats = await db.categories.where("plannerId").equals(y27.id).toArray();
    const habits = await db.habits.where("plannerId").equals(y27.id).toArray();
    expect(cats.map((c) => c.name).sort()).toEqual(cats26.map((c) => c.name).sort());
    expect(cats.map((c) => c.name)).toContain("Choir");
    expect(habits.map((h) => h.name)).toEqual(["Walk"]); // retired ones stay behind
  });

  it("marks the new year dirty so the silent Drive backup picks it up", async () => {
    const y26 = await ensurePlannerSeeded(2026);
    await ensureSideButtonsSeeded(y26.id);
    await db.syncQueue.clear();
    const y27 = await ensurePlannerSeeded(2027);
    const queued = await db.syncQueue.toArray();
    const tables = new Set(queued.map((q) => q.table));
    expect(tables.has("planners")).toBe(true);
    expect(tables.has("pages")).toBe(true);
    expect(tables.has("sideButtons")).toBe(true);
    const buttons = await db.sideButtons.where("plannerId").equals(y27.id).toArray();
    const queuedIds = new Set(queued.map((q) => q.rowId));
    expect(buttons.every((b) => queuedIds.has(b.id))).toBe(true);
  });

  it("falls back to the current week for a button whose page didn't roll over", async () => {
    const y26 = await ensurePlannerSeeded(2026);
    // a button pointing at a BUILT-IN page (not carried) — e.g. a month page
    await addSideButton(y26.id, { label: "Gone", target: "page:not-a-real-page" });
    const y27 = await ensurePlannerSeeded(2027);
    const b = (await db.sideButtons.where("plannerId").equals(y27.id).toArray()).find(
      (x) => x.label === "Gone"
    )!;
    expect(b.target).toBe("current-week");
  });
});
