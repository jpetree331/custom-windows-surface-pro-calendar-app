"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { usePlannerUI } from "./ui-context";

/** "🎂 Mom in 1 wk" lead chips — bottom-right of the day, fed by the derived
 *  birthday-lead notice rows regenerated on every Google sync. */
export default function BirthdayReminders({
  dayISO,
  compact = false,
}: {
  dayISO: string;
  compact?: boolean;
}) {
  const { plannerId } = usePlannerUI();
  const notices = useLiveQuery(
    () =>
      db.events
        .where("date")
        .equals(dayISO)
        .and((e) => e.plannerId === plannerId && e.kind === "notice" && e.noticeKind === "birthday-lead")
        .toArray(),
    [dayISO, plannerId]
  );
  if (!notices || notices.length === 0) return null;
  return (
    <div
      className="pointer-events-none flex flex-col items-end gap-[0.1cqw]"
      style={{ fontSize: compact ? "0.95cqw" : "1.2cqw" }}
    >
      {notices.slice(0, 3).map((n) => (
        <span
          key={n.id}
          data-birthday-reminder={n.title}
          className="max-w-full truncate rounded-sm bg-pink-100/90 px-[0.3cqw] font-medium text-pink-800"
        >
          {n.leadLabel ?? n.title}
        </span>
      ))}
    </div>
  );
}
