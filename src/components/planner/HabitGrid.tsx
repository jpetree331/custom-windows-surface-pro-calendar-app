"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Habit, Page } from "@/lib/db/types";
import { addDays, fromISO, toISO, DAY_ABBR } from "@/lib/planner/dates";
import { HABIT_REGION } from "@/lib/planner/constants";
import { checkDate, toggleHabitCheck } from "@/lib/habits/actions";

const MIN_ROWS = 9;

/**
 * HABITS grid on week pages — pen-first, paper-style:
 * - The grid itself is `pointer-events: none`, so Jo can HANDWRITE habit names
 *   on the empty lines and pen her own checkmarks — ink passes straight
 *   through to the canvas below.
 * - Only the day cells of habits added via ⚙ are interactive: a pen tap there
 *   toggles a persisted check (weekly habits = one full-width cell).
 * All rows share equal heights (header included).
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
  const totalRows = Math.max(MIN_ROWS, active.length) + 1; // + header
  const rowH = `${100 / totalRows}%`;

  const isChecked = (h: Habit, day: string) => checks?.has(`${h.id}|${checkDate(h, day)}`) ?? false;

  return (
    <div
      data-habit-grid={page.id}
      className="pointer-events-none absolute overflow-hidden bg-white/30"
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
          <tr style={{ height: rowH }}>
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
            <tr key={h.id} data-habit-row={h.name} style={{ height: rowH }}>
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
                  className="pointer-events-auto cursor-pointer border text-center align-middle"
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
                    className="pointer-events-auto cursor-pointer border text-center align-middle"
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
          {Array.from({ length: totalRows - 1 - active.length }, (_, r) => (
            // Blank paper lines: not interactive — handwrite here with the pen.
            <tr key={`b${r}`} style={{ height: rowH }}>
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
