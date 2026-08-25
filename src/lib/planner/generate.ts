import { db } from "@/lib/db/db";
import type { Page, Planner } from "@/lib/db/types";
import { MONTH_NAMES, daysInMonth, toISO, weeksOfYear } from "./dates";
import { PLANNER_YEAR, SECTIONS } from "./constants";
import { STARTERS } from "@/lib/categories/actions";
import { PLANNER_NAME } from "@/lib/branding";
import { queueSync } from "@/lib/sync";

/** Every seeded row must reach the sync queue, or the silent Drive backup
 *  sees a "clean" database and skips a whole new year of setup. */
const queueAll = async (table: string, rows: { id: string }[]) => {
  for (const r of rows) await queueSync(table, r.id, "put");
};

/**
 * Build the full 79-page planner for a year:
 * YEAR, then per month [MONTH page, its weeks…], then the section pages.
 */
export function buildPages(plannerId: string, year: number): Page[] {
  const now = Date.now();
  const pages: Page[] = [];
  let index = 0;

  const page = (p: Omit<Page, "id" | "plannerId" | "index" | "updatedAt">): void => {
    pages.push({ ...p, id: crypto.randomUUID(), plannerId, index: index++, updatedAt: now });
  };

  page({
    type: "year",
    label: `'${String(year).slice(2)}`,
    monthIndex: -1,
    dateStart: `${year}-01-01`,
    dateEnd: `${year}-12-31`,
    meta: { year },
  });

  const weeks = weeksOfYear(year);
  for (let m = 0; m < 12; m++) {
    page({
      type: "month",
      label: MONTH_NAMES[m],
      monthIndex: m,
      dateStart: toISO(new Date(year, m, 1)),
      dateEnd: toISO(new Date(year, m, daysInMonth(year, m))),
      meta: { year },
    });
    for (const w of weeks.filter((w) => w.monthIndex === m)) {
      page({
        type: "week",
        label: `WEEK ${w.weekNumber}`,
        monthIndex: m,
        dateStart: toISO(w.start),
        dateEnd: toISO(w.end),
        meta: { weekNumber: w.weekNumber, year },
      });
    }
  }

  for (const section of SECTIONS) {
    for (let i = 0; i < section.count; i++) {
      page({
        type: "section",
        label: section.count > 1 ? `${section.label} ${i + 1}` : section.label,
        monthIndex: -1,
        dateStart: "",
        dateEnd: "",
        meta: { sectionKey: section.key, sectionPage: i + 1 },
      });
    }
  }

  return pages;
}

/**
 * Create a year's planner + all pages on first run (idempotent per year).
 * Creation, category/habit inheritance from the most recent earlier year, and
 * first-ever starter seeding all happen in ONE transaction, so an interrupted
 * first load can never leave a planner that exists but silently skipped its
 * setup (and concurrent callers — two tabs, StrictMode double effects — can't
 * double-seed: the second one finds the planner and does nothing).
 */
export async function ensurePlannerSeeded(year: number = PLANNER_YEAR): Promise<Planner> {
  return db.transaction(
    "rw",
    [db.planners, db.pages, db.categories, db.habits, db.sideButtons, db.syncQueue],
    async () => {
    let p = await db.planners.where("year").equals(year).first();
    if (p) {
      // Self-heal a planner row that somehow lost its pages.
      const pageCount = await db.pages.where("plannerId").equals(p.id).count();
      if (pageCount === 0) await db.pages.bulkAdd(buildPages(p.id, year));
      return p;
    }

    p = {
      id: crypto.randomUUID(),
      year,
      title: `${PLANNER_NAME} '${String(year).slice(2)}`,
      settings: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.planners.add(p);
    const fresh = buildPages(p.id, year);
    await db.pages.bulkAdd(fresh);
    await queueSync("planners", p.id, "put");
    await queueAll("pages", fresh);

    const previous = (await db.planners.where("year").below(year).toArray())
      .sort((a, b) => b.year - a.year)[0];
    if (previous) {
      // New year starts set up the way Jo left the previous one.
      const [cats, habits, prevPages, prevButtons] = await Promise.all([
        db.categories.where("plannerId").equals(previous.id).toArray(),
        db.habits.where("plannerId").equals(previous.id).toArray(),
        db.pages.where("plannerId").equals(previous.id).toArray(),
        db.sideButtons.where("plannerId").equals(previous.id).toArray(),
      ]);
      const newCats = cats.map((c) => ({ ...c, id: crypto.randomUUID(), plannerId: p.id }));
      const newHabits = habits
        .filter((h) => h.active)
        .map((h) => ({ ...h, id: crypto.randomUUID(), plannerId: p.id }));
      await db.categories.bulkAdd(newCats);
      await db.habits.bulkAdd(newHabits);
      await queueAll("categories", newCats);
      await queueAll("habits", newHabits);

      // Roll her OWN pages over too (Jo r13): pages she added at the back of
      // last year reappear at the back of the new one, with their titles —
      // structure only, so a year of handwriting isn't duplicated.
      const carried = prevPages
        .filter((pg) => pg.type === "section" && pg.meta.sectionKey === "custom")
        .sort((a, b) => a.index - b.index);
      const tail = await db.pages.where("plannerId").equals(p.id).count();
      const idMap = new Map<string, string>();
      const copies = carried.map((pg, i) => {
        const id = crypto.randomUUID();
        idMap.set(pg.id, id);
        return { ...pg, id, plannerId: p.id, index: tail + i, updatedAt: Date.now() };
      });
      if (copies.length) {
        await db.pages.bulkAdd(copies);
        await queueAll("pages", copies);
      }

      // …and her sidebar buttons, with page targets repointed at this
      // year's copies (a "page:" target for a page that didn't roll over
      // falls back to the current week rather than pointing into last year).
      const newButtons = prevButtons
        .sort((a, b) => a.order - b.order)
        .map((b, i) => {
          let target = b.target;
          if (target.startsWith("page:")) {
            const mapped = idMap.get(target.slice(5));
            target = mapped ? `page:${mapped}` : "current-week";
          }
          return { ...b, id: crypto.randomUUID(), plannerId: p.id, order: i, target };
        });
      await db.sideButtons.bulkAdd(newButtons);
      await queueAll("sideButtons", newButtons);
    } else {
      // Very first planner ever: seed Jo's starter categories atomically.
      const starters = STARTERS.map((s, i) => ({
        id: crypto.randomUUID(),
        plannerId: p.id,
        name: s.name,
        color: s.color,
        order: i,
      }));
      await db.categories.bulkAdd(starters);
      await queueAll("categories", starters);
    }
      return p;
    }
  );
}
