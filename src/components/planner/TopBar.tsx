"use client";

import { useState } from "react";
import { MONTH_ABBR } from "@/lib/planner/dates";

/**
 * JAN…DEC scroll-jump tabs + the year corner: tap the label to jump to the
 * year page; tap ▾ to switch between years or start the next one.
 */
export default function TopBar({
  activeMonth,
  yearLabel,
  years,
  activeYear,
  onJumpMonth,
  onJumpYear,
  onSwitchYear,
  onCreateYear,
}: {
  activeMonth: number;
  yearLabel: string;
  years: number[];
  activeYear: number;
  onJumpMonth: (m: number) => void;
  onJumpYear: () => void;
  onSwitchYear: (year: number) => void;
  onCreateYear: (year: number) => void;
}) {
  const [yearMenu, setYearMenu] = useState(false);
  const nextYear = Math.max(...years, activeYear) + 1;
  return (
    <nav
      className="flex h-9 shrink-0 items-stretch gap-[2px] bg-slate-300/80 px-1 pt-1"
      style={{ touchAction: "manipulation" }}
    >
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
      <div className="relative flex">
        <button
          data-year-tab
          onClick={onJumpYear}
          className="w-9 rounded-tl-md text-sm font-extrabold text-slate-900"
          title="Year overview"
        >
          {yearLabel}
        </button>
        <button
          data-year-menu-toggle
          onClick={() => setYearMenu((v) => !v)}
          className="w-5 rounded-tr-md text-xs font-bold text-slate-700"
          title="Switch year"
        >
          ▾
        </button>
        {yearMenu && (
          <div
            data-year-menu
            className="absolute right-0 top-9 z-50 w-36 rounded-b-lg border border-slate-200 bg-white py-1 shadow-xl"
          >
            {years.map((y) => (
              <button
                key={y}
                data-year-option={y}
                onClick={() => {
                  setYearMenu(false);
                  onSwitchYear(y);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 ${
                  y === activeYear ? "font-bold text-blue-700" : "text-slate-800"
                }`}
              >
                {y} {y === activeYear ? "✓" : ""}
              </button>
            ))}
            <button
              data-year-create={nextYear}
              onClick={() => {
                setYearMenu(false);
                onCreateYear(nextYear);
              }}
              className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              ＋ Start {nextYear}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
