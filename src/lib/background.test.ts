import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import {
  backgroundStrengthOf,
  clearBackground,
  getBackground,
  setBackground,
  setBackgroundStrength,
} from "./background";
import { ensurePlannerSeeded } from "@/lib/planner/generate";
import { createBackup, restoreBackup } from "@/lib/backup";

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("custom page background (Jo r15)", () => {
  it("set replaces in place, clear removes, strength clamps", async () => {
    const p = await ensurePlannerSeeded(2026);
    const a = await setBackground(p.id, new Blob([BYTES], { type: "image/jpeg" }));
    const b = await setBackground(p.id, new Blob([BYTES, BYTES], { type: "image/jpeg" }));
    expect(b.id).toBe(a.id); // one background per planner
    expect(await db.assets.count()).toBe(1);
    expect((await getBackground(p.id))?.blob.size).toBe(BYTES.length * 2);

    await setBackgroundStrength(p.id, 5);
    expect(backgroundStrengthOf((await db.planners.get(p.id))!.settings)).toBe(1);
    await setBackgroundStrength(p.id, 0.3);
    expect(backgroundStrengthOf((await db.planners.get(p.id))!.settings)).toBe(0.3);
    expect(backgroundStrengthOf({})).toBe(0.6);

    await clearBackground(p.id);
    expect(await getBackground(p.id)).toBeUndefined();
    await clearBackground(p.id); // idempotent
  });

  it("rides along in backups, bytes intact", async () => {
    const p = await ensurePlannerSeeded(2026);
    await setBackground(p.id, new Blob([BYTES], { type: "image/jpeg" }));
    const json = await (await createBackup()).text();
    await Promise.all(db.tables.map((t) => t.clear()));
    const { restored } = await restoreBackup(json);
    expect(restored.assets).toBe(1);
    const bg = await getBackground(p.id);
    expect([...new Uint8Array(await bg!.blob.arrayBuffer())]).toEqual([...BYTES]);
    expect(bg!.blob.type).toBe("image/jpeg");
  });

  it("carries over into the next year", async () => {
    const y26 = await ensurePlannerSeeded(2026);
    await setBackground(y26.id, new Blob([BYTES], { type: "image/jpeg" }));
    await setBackgroundStrength(y26.id, 0.4);
    const y27 = await ensurePlannerSeeded(2027);
    const bg = await getBackground(y27.id);
    expect(bg).toBeDefined();
    expect(bg!.id).not.toBe((await getBackground(y26.id))!.id);
    expect(backgroundStrengthOf(y27.settings)).toBe(0.4);
  });
});
