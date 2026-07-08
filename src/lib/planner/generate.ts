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

/** Create the planner + all pages on first run (idempotent). */
export async function ensurePlannerSeeded(): Promise<Planner> {
  return db.transaction("rw", db.planners, db.pages, async () => {
    let planner = await db.planners.where("year").equals(PLANNER_YEAR).first();
    if (!planner) {
      planner = {
        id: crypto.randomUUID(),
        year: PLANNER_YEAR,
        title: `Jo's Planner '${String(PLANNER_YEAR).slice(2)}`,
        settings: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.planners.add(planner);
    }
    const pageCount = await db.pages.where("plannerId").equals(planner.id).count();
    if (pageCount === 0) {
      await db.pages.bulkAdd(buildPages(planner.id, PLANNER_YEAR));
    }
    return planner;
  });
}
