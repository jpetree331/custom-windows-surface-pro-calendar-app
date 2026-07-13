import { db } from "@/lib/db/db";
import type { Page, Planner } from "@/lib/db/types";
import { MONTH_NAMES, daysInMonth, toISO, weeksOfYear } from "./dates";
import { PLANNER_YEAR, SECTIONS } from "./constants";

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

/** Create a year's planner + all pages on first run (idempotent per year). */
export async function ensurePlannerSeeded(year: number = PLANNER_YEAR): Promise<Planner> {
  const planner = await db.transaction("rw", db.planners, db.pages, async () => {
    let p = await db.planners.where("year").equals(year).first();
    const isNew = !p;
    if (!p) {
      p = {
        id: crypto.randomUUID(),
        year,
        title: `Jo's Planner '${String(year).slice(2)}`,
        settings: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.planners.add(p);
    }
    const pageCount = await db.pages.where("plannerId").equals(p.id).count();
    if (pageCount === 0) {
      await db.pages.bulkAdd(buildPages(p.id, year));
    }
    return { ...p, __isNew: isNew } as Planner & { __isNew: boolean };
  });

  // A brand-new later year inherits categories + active habits from the most
  // recent earlier planner, so 2027 starts set up the way Jo left 2026.
  if ((planner as Planner & { __isNew: boolean }).__isNew) {
    const previous = (await db.planners.where("year").below(year).toArray())
      .sort((a, b) => b.year - a.year)[0];
    if (previous) {
      const [cats, habits] = await Promise.all([
        db.categories.where("plannerId").equals(previous.id).toArray(),
        db.habits.where("plannerId").equals(previous.id).toArray(),
      ]);
      await db.categories.bulkAdd(
        cats.map((c) => ({ ...c, id: crypto.randomUUID(), plannerId: planner.id }))
      );
      await db.habits.bulkAdd(
        habits.filter((h) => h.active).map((h) => ({ ...h, id: crypto.randomUUID(), plannerId: planner.id }))
      );
    }
  }
  const { __isNew: _, ...clean } = planner as Planner & { __isNew: boolean };
  return clean;
}
