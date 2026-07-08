"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Habit, Page } from "@/lib/db/types";
import { addDays, fromISO, toISO, DAY_ABBR } from "@/lib/planner/dates";
import { HABIT_REGION } from "@/lib/planner/constants";
import { checkDate, toggleHabitCheck } from "@/lib/habits/actions";

const MIN_ROWS = 9;

/**
 * Interactive HABITS grid on week pages. Sits ABOVE the ink canvas so a pen
 * tap toggles a check (per the plan: "tappable/pennable"). Weekly habits show
 * one full-width cell; daily habits get Mon–Sun cells.
 */
export default function HabitGrid({ page, plannerId }: { page: Page; plannerId: string }) {
  const monday = fromISO(page.dateStart);
  const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(monday, i)));

  const habits = useLiveQuery(
    () => db.habits.where("plannerId").equals(plannerId).sortBy("order"),
    [plannerId]
  );
  const checks = useLiveQuery(async () => {
    if (!habits || habits.length === 0) return new Set<string>();
    const wanted = new Set(habits.flatMap((h) => days.map((d) => `${h.id}|${checkDate(h, d)}`)));
    const rows = await db.habitChecks.where("habitId").anyOf(habits.map((h) => h.id)).toArray();
    return new Set(
      rows.filter((r) => r.checked && wanted.has(`${r.habitId}|${r.date}`)).map((r) => `${r.habitId}|${r.date}`)
    );
  }, [habits, page.dateStart]);

  const active = (habits ?? []).filter((h) => h.active);
  const blankRows = Math.max(0, MIN_ROWS - active.length);

  const isChecked = (h: Habit, day: string) => checks?.has(`${h.id}|${checkDate(h, day)}`) ?? false;

  return (
    <div
      data-habit-grid={page.id}
      className="absolute overflow-hidden bg-white/45"
      style={{
        left: `${HABIT_REGION.left}%`,
        width: `${HABIT_REGION.width}%`,
        bottom: `${HABIT_REGION.bottom}%`,
        height: `${HABIT_REGION.height}%`,
        fontSize: "1.1cqw",
      }}
    >
      <table className="h-full w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="border font-bold" style={{ borderColor: "#8fb8d0", width: "30%" }}>
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
          {active.map((h) => (
            <tr key={h.id} data-habit-row={h.name}>
              <td
                className="truncate border px-[0.4cqw] font-medium"
                style={{ borderColor: "#8fb8d0" }}
                title={`${h.name} (${h.cadence})`}
              >
                {h.name}
              </td>
              {h.cadence === "weekly" ? (
                <td
                  colSpan={7}
                  className="cursor-pointer border text-center align-middle"
                  style={{ borderColor: "#8fb8d0" }}
                  data-habit-cell={`${h.id}|weekly`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    void toggleHabitCheck(h, days[0]);
                  }}
                >
                  {isChecked(h, days[0]) ? "✔ done this week" : ""}
                </td>
              ) : (
                days.map((day) => (
                  <td
                    key={day}
                    className="cursor-pointer border text-center align-middle"
                    style={{ borderColor: "#8fb8d0" }}
                    data-habit-cell={`${h.id}|${day}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      void toggleHabitCheck(h, day);
                    }}
                  >
                    {isChecked(h, day) ? "✔" : ""}
                  </td>
                ))
              )}
            </tr>
          ))}
          {Array.from({ length: blankRows }, (_, r) => (
            <tr key={`b${r}`}>
              {Array.from({ length: 8 }, (_, c) => (
                <td key={c} className="border" style={{ borderColor: "#8fb8d0" }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
