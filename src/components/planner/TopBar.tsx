"use client";

import { MONTH_ABBR } from "@/lib/planner/dates";

/** JAN…DEC scroll-jump tabs + the '26 corner (jumps to the year page). */
export default function TopBar({
  activeMonth,
  yearLabel,
  onJumpMonth,
  onJumpYear,
}: {
  activeMonth: number;
  yearLabel: string;
  onJumpMonth: (m: number) => void;
  onJumpYear: () => void;
}) {
  return (
    <nav className="flex h-9 shrink-0 items-stretch gap-[2px] bg-slate-300/80 px-1 pt-1">
      {MONTH_ABBR.map((abbr, m) => (
        <button
          key={abbr}
          data-month-tab={m}
          onClick={() => onJumpMonth(m)}
          className="flex-1 rounded-t-md border border-b-0 border-slate-400 text-xs font-bold tracking-wider text-slate-900 shadow-sm transition-colors sm:text-sm"
          style={{
            background:
              activeMonth === m
                ? "linear-gradient(180deg, #d9f5dc, #bfe8c8)"
                : "linear-gradient(180deg, #f5f6f8, #dcdfe4)",
          }}
          aria-current={activeMonth === m ? "page" : undefined}
        >
          {abbr}
        </button>
      ))}
      <button
        data-year-tab
        onClick={onJumpYear}
        className="w-10 rounded-t-md text-sm font-extrabold text-slate-900"
        title="Year overview"
      >
        {yearLabel}
      </button>
    </nav>
  );
}
