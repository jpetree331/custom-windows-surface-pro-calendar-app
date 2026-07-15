"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Page } from "@/lib/db/types";
import { MONTH_NAMES } from "@/lib/planner/dates";
import PageFrame from "./PageFrame";
import { usePlannerUI } from "../ui-context";

const LINES_PER_MONTH = 9;

/**
 * "Birthdays, etc." — Jo's fill-in-the-blanks layout: 3×4 month grid with
 * ruled lines. Birthdays already imported from Google Calendar print onto the
 * first lines automatically; everything else is handwriting space (the ink
 * canvas sits above this template).
 */
export default function BirthdaysPage({ page }: { page: Page }) {
  const ui = usePlannerUI();
  const year = ui.year;

  const birthdays = useLiveQuery(async () => {
    const rows = await db.events
      .where("plannerId")
      .equals(ui.plannerId)
      .and((e) => e.kind === "birthday" && e.date.startsWith(String(year)))
      .toArray();
    const byMonth = new Map<number, { day: number; title: string }[]>();
    for (const e of rows) {
      const m = Number(e.date.slice(5, 7)) - 1;
      const list = byMonth.get(m) ?? [];
      list.push({ day: Number(e.date.slice(8, 10)), title: e.title });
      byMonth.set(m, list);
    }
    for (const list of byMonth.values()) list.sort((a, b) => a.day - b.day);
    return byMonth;
  }, [ui.plannerId, year]);

  return (
    <PageFrame>
      <div className="absolute inset-[1.6cqw] flex flex-col border-[0.22cqw] border-black bg-white/55">
        {/* header */}
        <div
          className="flex items-baseline justify-between border-b-[0.22cqw] border-black px-[1.6cqw]"
          style={{ height: "8.5%" }}
        >
          <span
            className="self-center font-serif font-semibold text-black"
            style={{ fontSize: "3.6cqw" }}
          >
            Birthdays, etc.
          </span>
          <span className="self-center font-serif font-bold text-black" style={{ fontSize: "5cqw" }}>
            {year}
          </span>
        </div>

        {/* 3 × 4 month grid */}
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4">
          {Array.from({ length: 12 }, (_, m) => (
            <div
              key={m}
              data-birthday-month={m}
              className="flex min-h-0 flex-col border-black px-[1cqw] pb-[0.6cqw] [&:not(:nth-child(3n))]:border-r-[0.18cqw] [&:not(:nth-last-child(-n+3))]:border-b-[0.18cqw]"
            >
              <div
                className="pt-[0.3cqw] font-serif font-semibold tracking-wide text-black"
                style={{ fontSize: "1.7cqw" }}
              >
                {MONTH_NAMES[m]}
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-end">
                {Array.from({ length: LINES_PER_MONTH }, (_, i) => {
                  const entry = birthdays?.get(m)?.[i];
                  return (
                    <div
                      key={i}
                      className="flex-1 truncate border-b border-slate-500/80 leading-none"
                      style={{ fontSize: "1.35cqw" }}
                    >
                      {entry && (
                        <span className="align-bottom font-medium text-slate-800">
                          {entry.day} · {entry.title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
