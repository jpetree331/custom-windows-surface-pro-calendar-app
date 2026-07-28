import type { Page } from "@/lib/db/types";
import { addDays, fromISO, toISO, DAY_ABBR } from "@/lib/planner/dates";
import { holidaysForYear } from "@/lib/calendar/holidays";
import { moonPhasesForYear } from "@/lib/calendar/moon";
import PageFrame, { LabelPill } from "./PageFrame";
import EventChips from "../EventChips";
import WeekReminders from "../WeekReminders";

const DAY_LETTERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Weekly spread: 7 day rows left, TASKS / REMINDERS / HABITS column right. */
export default function WeekPage({ page }: { page: Page }) {
  const monday = fromISO(page.dateStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // computed at render — a fresh mount (page flip, app open) re-evaluates
  const todayISO = toISO(new Date());
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
              // bold inset outline makes TODAY jump out (Jo)
              style={
                toISO(d) === todayISO
                  ? { boxShadow: "inset 0 0 0 0.45cqw #1d4ed8" }
                  : undefined
              }
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
                {/* chips own the TOP of the day (Jo), full width; the wrapper
                    spans the whole cell so dragged chips can pin anywhere.
                    Right inset leaves the corner for the moon glyph. */}
                <div className="pointer-events-none absolute inset-[0.3cqw] right-[3cqw]">
                  <EventChips dayISO={toISO(d)} includeNotices={false} />
                </div>
                {(() => {
                  const m = marksFor(d);
                  return (
                    <>
                      {/* moon back in its classic top-right corner (Jo) */}
                      {m.moon && (
                        <span
                          className="absolute right-[0.5cqw] top-[0.2cqw]"
                          style={{ fontSize: "1.6cqw" }}
                          title={m.moon.name}
                        >
                          {m.moon.glyph}
                        </span>
                      )}
                      {m.holidays && (
                        <div
                          className="absolute bottom-[0.3cqw] left-[0.5cqw] font-semibold"
                          style={{ fontSize: "1.5cqw", color: "#2b6fb3" }}
                        >
                          {m.holidays.join(" · ")}
                        </div>
                      )}
                    </>
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
            {/* the week's 🔔/🎂 chips sit in line with the pill and wrap (Jo) */}
            <div className="flex flex-wrap items-center gap-[0.4cqw]">
              <LabelPill text="REMINDERS" />
              <WeekReminders weekStartISO={page.dateStart} />
            </div>
            {/* The interactive HABITS grid renders in the overlay stack
                (HabitGrid.tsx) so pen taps toggle checks. */}
          </div>
        </div>
      </div>

    </PageFrame>
  );
}
