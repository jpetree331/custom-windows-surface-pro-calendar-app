import { db } from "@/lib/db/db";
import type { Category } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";

/** Starter set — fully editable (Gate-free per the plan). */
const STARTERS: { name: string; color: string }[] = [
  { name: "Family", color: "#3fa9f5" },
  { name: "Business", color: "#6dbb3c" },
  { name: "Health", color: "#f2599a" },
  { name: "Home", color: "#f28d49" },
  { name: "Fun", color: "#8348c9" },
];

/** Seed starter categories once per planner. */
export async function ensureStarterCategories(plannerId: string) {
  const count = await db.categories.where("plannerId").equals(plannerId).count();
  if (count > 0) return;
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
