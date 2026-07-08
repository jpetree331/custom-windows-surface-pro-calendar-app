import type { Page } from "@/lib/db/types";
import { MONTH_NAMES, daysInMonth, firstDowOfMonth } from "@/lib/planner/dates";
import { holidaysForYear } from "@/lib/calendar/holidays";
import PageFrame from "./PageFrame";

function MiniMonth({ year, m }: { year: number; m: number }) {
  const lead = firstDowOfMonth(year, m);
  const count = daysInMonth(year, m);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= count ? day : null;
  });
  return (
    <div className="rounded-[0.5cqw] bg-white/35 p-[0.7cqw]">
      <div className="pb-[0.3cqw] text-center font-bold" style={{ fontSize: "1.5cqw", color: "#2b6fb3" }}>
        {MONTH_NAMES[m]}
      </div>
      <div className="grid grid-cols-7 text-center" style={{ fontSize: "1.05cqw" }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="font-semibold text-slate-600">{d}</span>
        ))}
        {cells.map((day, i) => {
          const iso = day
            ? `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : "";
          const isHoliday = day ? holidaysForYear(year).has(iso) : false;
          return (
            <span
              key={`d${i}`}
              className={`leading-[1.5] ${isHoliday ? "rounded-full bg-sky-300/60 font-semibold" : ""} text-black`}
              title={isHoliday ? holidaysForYear(year).get(iso)!.join(", ") : undefined}
            >
              {day ?? ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Year overview: '26 title + 12 mini month grids. */
export default function YearPage({ page }: { page: Page }) {
  const year = (page.meta.year as number) ?? new Date().getFullYear();
  return (
    <PageFrame>
      <div className="absolute inset-[1.6cqw] flex flex-col">
        <h1 className="pb-[1cqw] font-bold text-black" style={{ fontSize: "4.4cqw" }}>
          {page.label}
        </h1>
        <div className="grid flex-1 grid-cols-3 gap-[1.2cqw]">
          {Array.from({ length: 12 }, (_, m) => (
            <MiniMonth key={m} year={year} m={m} />
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
