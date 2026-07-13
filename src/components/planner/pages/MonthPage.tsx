"use client";

import type { Page } from "@/lib/db/types";
import { DAY_ABBR, daysInMonth, firstDowOfMonth } from "@/lib/planner/dates";
import { holidaysForYear } from "@/lib/calendar/holidays";
import { moonPhasesForYear } from "@/lib/calendar/moon";
import PageFrame from "./PageFrame";
import EventChips from "../EventChips";
import { usePlannerUI } from "../ui-context";

/** Month page: Mon-start grid with blue date numbers. */
export default function MonthPage({ page }: { page: Page }) {
  const ui = usePlannerUI();
  const year = (page.meta.year as number) ?? new Date().getFullYear();
  const m = page.monthIndex;
  const lead = firstDowOfMonth(year, m);
  const count = daysInMonth(year, m);
  const rows = Math.ceil((lead + count) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= count ? day : null;
  });
  const holidays = holidaysForYear(year);
  const moons = moonPhasesForYear(year);
  const isoOf = (day: number) =>
    `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <PageFrame>
      <div className="absolute inset-[1.2cqw] flex flex-col">
        <h2
          className="pb-[0.6cqw] font-bold tracking-[0.18em] text-black"
          style={{ fontSize: "3.4cqw" }}
        >
          {page.label}
        </h2>
        <div className="flex border-[0.18cqw] border-b-0 border-black">
          {DAY_ABBR.map((d) => (
            <div
              key={d}
              className="flex-1 border-r-[0.14cqw] border-black bg-white/40 py-[0.3cqw] text-center font-bold last:border-r-0"
              style={{ fontSize: "1.7cqw" }}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          className="grid flex-1 border-[0.18cqw] border-black"
          style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {cells.map((day, i) => (
            <div
              key={i}
              className="border-r-[0.14cqw] border-b-[0.14cqw] border-black p-[0.4cqw] [&:nth-child(7n)]:border-r-0"
              data-date={day ? `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined}
            >
              {day && (
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    {/* Sits above the ink canvas (z-10): a pen tap on the
                        number NAVIGATES to that day's week page, not draws. */}
                    <button
                      data-day-jump={isoOf(day)}
                      title="Go to this week"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => ui.jumpToDate(isoOf(day))}
                      className="pointer-events-auto relative z-10 cursor-pointer rounded font-bold leading-none hover:bg-white/60 active:bg-white/80"
                      style={{ fontSize: "2.2cqw", color: "#3fa9f5" }}
                    >
                      {day}
                    </button>
                    {moons.get(isoOf(day)) && (
                      <span style={{ fontSize: "1.6cqw" }} title={moons.get(isoOf(day))!.name}>
                        {moons.get(isoOf(day))!.glyph}
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden pt-[0.2cqw]">
                    <EventChips dayISO={isoOf(day)} compact />
                  </div>
                  {holidays.get(isoOf(day)) && (
                    <span
                      className="mt-auto font-semibold leading-tight"
                      style={{ fontSize: "1.15cqw", color: "#2b6fb3" }}
                    >
                      {holidays.get(isoOf(day))!.join(" · ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
