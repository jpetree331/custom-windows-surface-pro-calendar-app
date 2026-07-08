"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";

/** Colored event/birthday chips for one day cell (week + month templates). */
export default function EventChips({
  dayISO,
  compact = false,
}: {
  dayISO: string;
  compact?: boolean;
}) {
  const events = useLiveQuery(
    () => db.events.where("date").equals(dayISO).toArray(),
    [dayISO]
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  if (!events || events.length === 0) return null;

  const colorOf = (e: PlannerEvent) =>
    categories.find((c) => c.id === e.categoryId)?.color ?? (e.kind === "birthday" ? "#f2599a" : "#3fa9f5");

  return (
    <div className="flex flex-col gap-[0.15cqw]" style={{ fontSize: compact ? "1.05cqw" : "1.4cqw" }}>
      {events.slice(0, compact ? 3 : 6).map((e) => (
        <div
          key={e.id}
          data-event-chip={e.title}
          className="truncate rounded-sm px-[0.35cqw] font-medium leading-snug text-white"
          style={{ background: colorOf(e) }}
          title={`${e.title}${e.startTime ? ` · ${e.startTime}` : ""}`}
        >
          {e.kind === "birthday" ? "🎂 " : ""}
          {e.startTime && !compact ? `${e.startTime} ` : ""}
          {e.title}
        </div>
      ))}
      {events.length > (compact ? 3 : 6) && (
        <span className="text-slate-600" style={{ fontSize: "1cqw" }}>
          +{events.length - (compact ? 3 : 6)} more
        </span>
      )}
    </div>
  );
}
