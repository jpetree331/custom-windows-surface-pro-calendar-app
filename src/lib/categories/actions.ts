import { db } from "@/lib/db/db";
import type { Category } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";

/** Starter set = Jo's category color system (fully editable in ⚙). */
export const STARTERS: { name: string; color: string }[] = [
  { name: "Appointments", color: "#3DC9FD" },
  { name: "To-Do List", color: "#7400B3" },
  { name: "Cleaning Chores", color: "#78B13B" },
  { name: "Business Stuff", color: "#D50404" },
  { name: "Birthdays", color: "#FF9B24" },
  { name: "Holidays", color: "#FF5CB9" },
  { name: "Misc.", color: "#000000" },
];

/** The pre-Jo starter set — recognized so an untouched install auto-upgrades. */
const LEGACY_STARTERS = new Set([
  "Family|#3fa9f5", "Business|#6dbb3c", "Health|#f2599a", "Home|#f28d49", "Fun|#8348c9",
]);

/** Seed starter categories once per planner (upgrading untouched legacy sets). */
export async function ensureStarterCategories(plannerId: string) {
  const existing = await db.categories.where("plannerId").equals(plannerId).toArray();
  if (existing.length > 0) {
    const untouchedLegacy =
      existing.length === LEGACY_STARTERS.size &&
      existing.every((c) => LEGACY_STARTERS.has(`${c.name}|${c.color}`));
    if (!untouchedLegacy) return;
    await db.categories.bulkDelete(existing.map((c) => c.id));
    for (const c of existing) await queueSync("categories", c.id, "delete");
  }
  const rows: Category[] = STARTERS.map((s, i) => ({
    id: crypto.randomUUID(),
    plannerId,
    name: s.name,
    color: s.color,
    order: i,
  }));
  await db.categories.bulkAdd(rows);
  for (const r of rows) await queueSync("categories", r.id, "put");
}

export async function addCategory(plannerId: string, name: string, color: string): Promise<Category> {
  const order = await db.categories.where("plannerId").equals(plannerId).count();
  const cat: Category = { id: crypto.randomUUID(), plannerId, name, color, order };
  await db.categories.add(cat);
  await queueSync("categories", cat.id, "put");
  return cat;
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, "name" | "color">>) {
  await db.categories.update(id, patch);
  await queueSync("categories", id, "put");
}

/** Delete a category and untag anything that used it. */
export async function deleteCategory(id: string) {
  await db.transaction("rw", db.categories, db.blocks, db.events, async () => {
    await db.blocks.filter((b) => b.categoryId === id).modify((b) => { b.categoryId = undefined; });
    await db.events.filter((e) => e.categoryId === id).modify((e) => { e.categoryId = undefined; });
    await db.categories.delete(id);
  });
  await queueSync("categories", id, "delete");
}
