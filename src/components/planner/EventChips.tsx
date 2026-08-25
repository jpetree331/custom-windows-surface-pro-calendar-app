"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { usePlannerUI } from "./ui-context";
import { formatTime } from "@/lib/settings";
import { moveEventChip, resetEventChipPosition, setEventDone } from "@/lib/events/actions";
import { clampChipOffset } from "@/lib/events/layout";
import { toISO } from "@/lib/planner/dates";

/**
 * Colored event/birthday chips for one day cell (week + month templates).
 * The root must be given the cell's box (h-full/absolute wrapper): un-dragged
 * chips stack from the top; dragged chips pin absolutely at their stored
 * offset (% of this box). Details popover on hover (mouse) or double-tap.
 */
export default function EventChips({
  dayISO,
  compact = false,
  includeNotices = true,
  includeTasks = true,
  align = "left",
  reserveRight = "0cqw",
}: {
  dayISO: string;
  compact?: boolean;
  /** Week pages render 🔔 chips in the REMINDERS panel instead (Jo r10). */
  includeNotices?: boolean;
  /** Month pages leave Google Tasks out (Jo r13). */
  includeTasks?: boolean;
  /** "right" parks imported items in the day's top-right corner, wrapping
   *  onto further lines once they pass half the cell (Jo r13). */
  align?: "left" | "right";
  /** Space kept clear on the right — the moon glyph's corner. */
  reserveRight?: string;
}) {
  const { plannerId, timeFormat, tool } = usePlannerUI();
  const rootRef = useRef<HTMLDivElement>(null);
  const events = useLiveQuery(
    // planner-scoped: a restored backup can leave a second same-year planner.
    // "birthday-lead" rows are legacy (r12 stopped generating them; Jo's own
    // Google notifications cover birthdays) — filtered out where they'd
    // otherwise linger from an older import.
    () =>
      db.events
        .where("date")
        .equals(dayISO)
        .and(
          (e) =>
            e.plannerId === plannerId &&
            (includeNotices
              ? !(e.kind === "notice" && e.noticeKind === "birthday-lead")
              : e.kind !== "notice") &&
            (includeTasks || e.kind !== "reminder")
        )
        .toArray(),
    [dayISO, plannerId, includeNotices, includeTasks]
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  // Tap a chip to reveal a long title; tap again to collapse.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ ev: PlannerEvent; left: number; top: number } | null>(null);
  const dragRef = useRef<{
    ev: PlannerEvent;
    startX: number;
    startY: number;
    seed: { x: number; y: number };
    chip: { w: number; h: number };
    cell: { w: number; h: number };
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef<{ id: string; at: number; x: number; y: number } | null>(null);
  // A real drag still fires a trailing click — swallow it so repositioning
  // a chip doesn't also toggle it expanded.
  const suppressClickRef = useRef(false);
  if (!events || events.length === 0) return null;

  const colorOf = (e: PlannerEvent) =>
    categories.find((c) => c.id === e.categoryId)?.color ??
    (e.kind === "birthday" ? "#f2599a" : e.kind === "notice" ? "#64748b" : "#3fa9f5");

  const flow = events.filter((e) => e.offsetX == null);
  const pinned = events.filter((e) => e.offsetX != null);
  const maxFlow = compact ? 3 : 6;
  const todayISO = toISO(new Date());

  const openPopover = (e: PlannerEvent, chipEl: HTMLElement) => {
    const r = chipEl.getBoundingClientRect();
    // fixed positioning escapes the month cell's overflow clipping; clamp to
    // the viewport so corner cells stay readable
    setPopover({
      ev: e,
      left: Math.min(r.left, window.innerWidth - 260),
      top: Math.min(r.bottom + 4, window.innerHeight - 190),
    });
  };

  const chipEl = (e: PlannerEvent, pinnedChip: boolean) => {
    const expanded = expandedId === e.id;
    const draggable = tool === "select" && e.kind !== "notice";
    // events (not tasks/birthdays) fade once their day has passed (Jo r11)
    const past = e.kind === "event" && e.date < todayISO;
    return (
      <div
        key={e.id}
        data-event-chip={e.title}
        data-expanded={expanded || undefined}
        data-pinned={pinnedChip || undefined}
        data-done={e.done || undefined}
        className={`pointer-events-auto z-10 max-w-full cursor-pointer rounded-sm px-[0.35cqw] font-medium leading-snug text-white ${
          expanded ? "whitespace-normal break-words" : "truncate"
        } ${pinnedChip ? "absolute" : "relative"} ${e.kind === "notice" ? "italic" : ""} ${
          e.done ? "line-through opacity-60" : past ? "opacity-45" : ""
        }`}
        style={{
          background: colorOf(e),
          ...(pinnedChip ? { left: `${e.offsetX}%`, top: `${e.offsetY}%` } : null),
          ...(draggable ? { touchAction: "none" } : null),
        }}
        title={`${e.title}${e.startTime ? ` · ${formatTime(e.startTime, timeFormat)}` : ""}`}
        onPointerEnter={(ev) => {
          if (ev.pointerType === "mouse") openPopover(e, ev.currentTarget as HTMLElement);
        }}
        onPointerLeave={(ev) => {
          if (ev.pointerType === "mouse") setPopover(null);
        }}
        onPointerDown={(ev) => {
          ev.stopPropagation();
          if (!draggable || !rootRef.current) return;
          const cell = rootRef.current.getBoundingClientRect();
          const chip = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          dragRef.current = {
            ev: e,
            startX: ev.clientX,
            startY: ev.clientY,
            seed: {
              x: e.offsetX ?? ((chip.left - cell.left) / Math.max(1, cell.width)) * 100,
              y: e.offsetY ?? ((chip.top - cell.top) / Math.max(1, cell.height)) * 100,
            },
            chip: { w: chip.width, h: chip.height },
            cell: { w: cell.width, h: cell.height },
            moved: false,
          };
          try {
            (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
          } catch {
            // best-effort capture
          }
        }}
        onPointerMove={(ev) => {
          const d = dragRef.current;
          if (!d || d.ev.id !== e.id) return;
          const dx = ev.clientX - d.startX;
          const dy = ev.clientY - d.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) {
            (ev.currentTarget as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
          }
        }}
        onPointerUp={(ev) => {
          const d = dragRef.current;
          dragRef.current = null;
          (ev.currentTarget as HTMLElement).style.transform = "";
          if (!d || d.ev.id !== e.id || !d.moved) return;
          suppressClickRef.current = true;
          const pos = clampChipOffset(
            d.cell,
            d.chip,
            d.seed,
            ev.clientX - d.startX,
            ev.clientY - d.startY
          );
          void moveEventChip(d.ev, pos.x, pos.y);
        }}
        onClick={(ev) => {
          ev.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          const d = lastTapRef.current;
          const now = performance.now();
          if (d && d.id === e.id && now - d.at < 350 && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 12) {
            // double-tap (pen/touch) = details
            lastTapRef.current = null;
            openPopover(e, ev.currentTarget as HTMLElement);
            return;
          }
          lastTapRef.current = { id: e.id, at: now, x: ev.clientX, y: ev.clientY };
          setExpandedId(expanded ? null : e.id);
        }}
      >
        {e.kind === "birthday" ? "🎂 " : ""}
        {e.startTime && !compact ? `${formatTime(e.startTime, timeFormat)} ` : ""}
        {e.title}
        {expanded && e.kind !== "notice" && (
          <button
            data-chip-action="done"
            title={e.done ? "Un-check" : "Mark done — crosses it out"}
            className="ml-1 rounded bg-white/25 px-0.5"
            onClick={(ev) => {
              ev.stopPropagation();
              void setEventDone(e, !e.done);
            }}
          >
            {e.done ? "☑" : "☐"}
          </button>
        )}
        {expanded && e.offsetX != null && (
          <button
            data-chip-action="unpin"
            title="Put back in the day's list"
            className="ml-1 rounded bg-white/25 px-0.5"
            onClick={(ev) => {
              ev.stopPropagation();
              void resetEventChipPosition(e);
            }}
          >
            ↺
          </button>
        )}
      </div>
    );
  };

  return (
    // min-w-0 everywhere: a long unbreakable title must never widen its
    // month-grid column (grid items default to min-width:auto).
    <div
      ref={rootRef}
      className="relative h-full w-full min-w-0"
      style={{ fontSize: compact ? "1.05cqw" : "1.4cqw" }}
    >
      {/* The root still spans the WHOLE cell so dragged chips keep their
          stored %-offsets; only the flow layout moves (Jo r13). */}
      <div
        className={
          align === "right"
            ? "absolute right-0 top-0 flex max-w-[52%] flex-wrap justify-end gap-x-[0.3cqw] gap-y-[0.15cqw]"
            : "flex w-full min-w-0 flex-col items-start gap-[0.15cqw]"
        }
        style={align === "right" ? { paddingRight: reserveRight } : undefined}
      >
        {flow.slice(0, maxFlow).map((e) => chipEl(e, false))}
        {flow.length > maxFlow && (
          <span className="text-slate-600" style={{ fontSize: "1cqw" }}>
            +{flow.length - maxFlow} more
          </span>
        )}
      </div>
      {pinned.map((e) => chipEl(e, true))}
      {popover && (
        <>
          <div
            className="fixed inset-0 z-[3000]"
            data-event-popover-backdrop
            onClick={() => setPopover(null)}
            onPointerDown={(ev) => ev.stopPropagation()}
          />
          <div
            data-event-popover
            className="fixed z-[3010] w-60 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-xl"
            style={{ left: popover.left, top: popover.top, fontSize: "12px" }}
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <div className="font-bold text-slate-800">{popover.ev.title}</div>
            <div className="text-slate-600">
              {popover.ev.allDay
                ? "All day"
                : `${popover.ev.startTime ? formatTime(popover.ev.startTime, timeFormat) : ""}${
                    popover.ev.endTime ? ` – ${formatTime(popover.ev.endTime, timeFormat)}` : ""
                  }`}
            </div>
            {popover.ev.location && <div className="mt-1 text-slate-600">📍 {popover.ev.location}</div>}
            {popover.ev.description && (
              <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-slate-700">
                {popover.ev.description}
              </div>
            )}
            {popover.ev.reminderOverridesMin?.length ? (
              <div className="mt-1 text-slate-600">
                🔔 Reminds{" "}
                {popover.ev.reminderOverridesMin
                  .map((m) => `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? "" : "s"}`)
                  .join(", ")}{" "}
                before
              </div>
            ) : null}
            {popover.ev.kind !== "notice" && (
              <button
                data-popover-action="done"
                onClick={() => {
                  void setEventDone(popover.ev, !popover.ev.done);
                  setPopover(null);
                }}
                className="mt-2 rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
              >
                {popover.ev.done ? "Un-check" : "✓ Mark done"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
