"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { addDays, fromISO, toISO } from "@/lib/planner/dates";
import { usePlannerUI } from "./ui-context";

/** A reminder outlives its usefulness the moment its event has happened
 *  (Jo r12). Checked at render so it disappears on the day even if the next
 *  Google sync is days away; rows imported before r12 carry no parentDate,
 *  so they fall back to their own date. */
function stillPending(n: { parentDate?: string; date: string }, todayISO: string): boolean {
  return (n.parentDate ?? n.date) >= todayISO;
}

/**
 * The week's 🔔 notification + 🎂 birthday-lead chips, gathered into the
 * REMINDERS panel (Jo: in line with the color chip, wrapping as needed).
 * Renders a fragment so the chips flow in the panel's flex-wrap row.
 */
export default function WeekReminders({ weekStartISO }: { weekStartISO: string }) {
  const { plannerId, todayISO } = usePlannerUI();
  const weekEndISO = toISO(addDays(fromISO(weekStartISO), 6));
  const notices = useLiveQuery(
    () =>
      db.events
        .where("plannerId").equals(plannerId)
        .and((e) => e.kind === "notice" && e.date >= weekStartISO && e.date <= weekEndISO)
        .toArray(),
    [plannerId, weekStartISO, weekEndISO]
  );
  const pending = (notices ?? []).filter((n) => stillPending(n, todayISO));
  if (pending.length === 0) return null;
  return (
    <>
      {pending
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((n) => (
          <span
            key={n.id}
            data-week-reminder={n.title}
            className={`max-w-full truncate rounded-sm px-[0.35cqw] font-medium leading-snug ${
              n.noticeKind === "birthday-lead"
                ? "bg-pink-100/90 text-pink-800"
                : "bg-slate-200/90 text-slate-700"
            }`}
            style={{ fontSize: "1.35cqw" }}
          >
            {n.leadLabel ?? n.title}
          </span>
        ))}
    </>
  );
}
