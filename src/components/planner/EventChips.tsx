"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { usePlannerUI } from "./ui-context";
import { formatTime } from "@/lib/settings";

/** Colored event/birthday chips for one day cell (week + month templates). */
export default function EventChips({
  dayISO,
  compact = false,
}: {
  dayISO: string;
  compact?: boolean;
}) {
  const { plannerId, timeFormat } = usePlannerUI();
  const events = useLiveQuery(
    // planner-scoped: a restored backup can leave a second same-year planner
    () =>
      db.events
        .where("date")
        .equals(dayISO)
        .and((e) => e.plannerId === plannerId)
        .toArray(),
    [dayISO, plannerId]
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  // Tap a chip to reveal a long title; tap again to collapse.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!events || events.length === 0) return null;

  const colorOf = (e: PlannerEvent) =>
    categories.find((c) => c.id === e.categoryId)?.color ?? (e.kind === "birthday" ? "#f2599a" : "#3fa9f5");

  return (
    // min-w-0 everywhere: a long unbreakable title must never widen its
    // month-grid column (grid items default to min-width:auto).
    <div
      className="flex w-full min-w-0 flex-col items-start gap-[0.15cqw]"
      style={{ fontSize: compact ? "1.05cqw" : "1.4cqw" }}
    >
      {events.slice(0, compact ? 3 : 6).map((e) => {
        const expanded = expandedId === e.id;
        return (
          <div
            key={e.id}
            data-event-chip={e.title}
            data-expanded={expanded || undefined}
            // background hugs the text; sits above the ink canvas so a tap
            // toggles the full title (mirrors the day-number jump buttons)
            className={`pointer-events-auto relative z-10 max-w-full cursor-pointer rounded-sm px-[0.35cqw] font-medium leading-snug text-white ${
              expanded ? "whitespace-normal break-words" : "truncate"
            }`}
            style={{ background: colorOf(e) }}
            title={`${e.title}${e.startTime ? ` · ${formatTime(e.startTime, timeFormat)}` : ""}`}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation();
              setExpandedId(expanded ? null : e.id);
            }}
          >
            {e.kind === "birthday" ? "🎂 " : ""}
            {e.startTime && !compact ? `${formatTime(e.startTime, timeFormat)} ` : ""}
            {e.title}
          </div>
        );
      })}
      {events.length > (compact ? 3 : 6) && (
        <span className="text-slate-600" style={{ fontSize: "1cqw" }}>
          +{events.length - (compact ? 3 : 6)} more
        </span>
      )}
    </div>
  );
}
