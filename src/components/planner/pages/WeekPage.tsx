import type { Page } from "@/lib/db/types";
import { addDays, fromISO, toISO, DAY_ABBR, MONTH_NAMES } from "@/lib/planner/dates";
import { holidaysForYear } from "@/lib/calendar/holidays";
import { moonPhasesForYear } from "@/lib/calendar/moon";
import PageFrame, { LabelPill } from "./PageFrame";

const DAY_LETTERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const HABIT_ROWS = 9;

/** Weekly spread: 7 day rows left, TASKS / CLEANING / HABITS column right. */
export default function WeekPage({ page }: { page: Page }) {
  const monday = fromISO(page.dateStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // Per-day lookup (memoized per year) — edge weeks span adjacent years.
  const marksFor = (d: Date) => {
    const iso = toISO(d);
    return {
      holidays: holidaysForYear(d.getFullYear()).get(iso),
      moon: moonPhasesForYear(d.getFullYear()).get(iso),
    };
  };

  return (
    <PageFrame>
      <div className="absolute inset-[1.2cqw] flex border-[0.18cqw] border-black">
        {/* Day rows */}
        <div className="flex h-full flex-col" style={{ width: "57%" }}>
          {days.map((d, i) => (
            <div
              key={i}
              className="flex min-h-0 flex-1 border-b-[0.18cqw] border-black last:border-b-0"
            >
              <div
                className="flex flex-col border-r-[0.18cqw] border-black"
                style={{ width: "4.6cqw" }}
              >
                <div
                  className="pl-[0.5cqw] font-bold leading-none"
                  style={{ fontSize: "2.7cqw", color: "#3fa9f5" }}
                >
                  {d.getDate()}
                </div>
                <div
                  className="flex flex-1 flex-col items-center justify-center font-bold leading-[1.05] text-black"
                  style={{ fontSize: "2.2cqw" }}
                >
                  {DAY_LETTERS[i].split("").map((ch, j) => (
                    <span key={j}>{ch}</span>
                  ))}
                </div>
              </div>
              <div className="relative flex-1" data-day={toISO(d)}>
                {(() => {
                  const m = marksFor(d);
                  if (!m.holidays && !m.moon) return null;
                  return (
                    <div
                      className="absolute right-[0.6cqw] top-[0.3cqw] flex items-center gap-[0.5cqw]"
                      style={{ fontSize: "1.5cqw" }}
                    >
                      {m.holidays && (
                        <span className="font-semibold" style={{ color: "#2b6fb3" }}>
                          {m.holidays.join(" · ")}
                        </span>
                      )}
                      {m.moon && <span title={m.moon.name}>{m.moon.glyph}</span>}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        {/* Right column */}
        <div className="flex h-full flex-1 flex-col border-l-[0.18cqw] border-black">
          <div className="min-h-0 basis-[52%] p-[0.8cqw]">
            <LabelPill text="TASKS" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t-[0.18cqw] border-black p-[0.8cqw]">
            <LabelPill text="CLEANING" />
            {/* Habits grid pinned to the bottom */}
            <div
              className="mt-auto mr-[2.2cqw] bg-white/45"
              style={{ fontSize: "1.1cqw" }}
            >
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th
                      className="border font-bold"
                      style={{ borderColor: "#8fb8d0", width: "32%" }}
                    >
                      HABITS
                    </th>
                    {DAY_ABBR.map((d) => (
                      <th key={d} className="border font-semibold" style={{ borderColor: "#8fb8d0" }}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: HABIT_ROWS }, (_, r) => (
                    <tr key={r}>
                      {Array.from({ length: 8 }, (_, c) => (
                        <td
                          key={c}
                          className="border"
                          style={{ borderColor: "#8fb8d0", height: "1.7cqw" }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical month tag on the right edge */}
      <div
        className="absolute font-bold tracking-[0.35em]"
        style={{
          right: "0.1cqw",
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)",
          transformOrigin: "center",
          fontSize: "2.4cqw",
          color: "#3fc4f5",
          whiteSpace: "nowrap",
        }}
      >
        {MONTH_NAMES[page.monthIndex]}
      </div>
    </PageFrame>
  );
}
