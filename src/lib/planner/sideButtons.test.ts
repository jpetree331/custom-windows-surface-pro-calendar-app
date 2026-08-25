import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import {
  DEFAULT_SIDE_BUTTONS,
  ensureSideButtonsSeeded,
  moveSideButton,
  deleteSideButton,
  addSideButton,
} from "./sideButtons";

const P = "p1";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("side button seeding + ordering", () => {
  it("seeds the classic six exactly once", async () => {
    await ensureSideButtonsSeeded(P);
    await ensureSideButtonsSeeded(P);
    const rows = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(rows.length).toBe(DEFAULT_SIDE_BUTTONS.length);
    expect(rows.map((r) => r.glyph)).toEqual(DEFAULT_SIDE_BUTTONS.map((d) => d.glyph));
  });

  it("seeds per planner independently", async () => {
    await ensureSideButtonsSeeded(P);
    await ensureSideButtonsSeeded("p2");
    expect(await db.sideButtons.count()).toBe(DEFAULT_SIDE_BUTTONS.length * 2);
  });

  it("reorder swaps stay correct after deletions leave order gaps", async () => {
    await ensureSideButtonsSeeded(P);
    let rows = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    await deleteSideButton(rows[1].id); // orders now 0,2,3,4,5
    rows = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    await moveSideButton(P, rows[1].id, -1); // swap with rows[0]
    const after = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(after[0].id).toBe(rows[1].id);
    expect(after[1].id).toBe(rows[0].id);
    // ends stay clamped
    await moveSideButton(P, after[0].id, -1);
    const clamped = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(clamped[0].id).toBe(after[0].id);
  });

  it("a button added after a deletion can still be reordered (Jo r13)", async () => {
    // Root cause of "Birthdays won't move below 5th": order was assigned from
    // the row COUNT, so after any delete a new button duplicated an existing
    // order value — and swapping two equal orders changes nothing.
    await ensureSideButtonsSeeded(P);
    const seeded = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    await deleteSideButton(seeded[0].id);
    const added = await addSideButton(P, { label: "Gifts", target: "page:x" });
    const orders = (await db.sideButtons.where("plannerId").equals(P).toArray())
      .map((b) => b.order)
      .sort((a, b) => a - b);
    expect(new Set(orders).size).toBe(orders.length); // no duplicates
    await moveSideButton(P, added.id, -1);
    const after = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(after[after.length - 2].id).toBe(added.id);
    // …and it keeps climbing, all the way to the top
    for (let i = 0; i < after.length; i++) await moveSideButton(P, added.id, -1);
    const top = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(top[0].id).toBe(added.id);
  });

  it("new buttons append at the end", async () => {
    await ensureSideButtonsSeeded(P);
    const added = await addSideButton(P, { label: "Gifts", target: "page:x" });
    const rows = await db.sideButtons.where("plannerId").equals(P).sortBy("order");
    expect(rows[rows.length - 1].id).toBe(added.id);
  });
});
