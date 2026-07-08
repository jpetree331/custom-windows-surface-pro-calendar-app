"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle, type ListRange } from "react-virtuoso";
import type { Page, Planner } from "@/lib/db/types";
import { db } from "@/lib/db/db";
import { ensurePlannerSeeded } from "@/lib/planner/generate";
import { toISO } from "@/lib/planner/dates";
import PageView from "./pages/PageView";
import TopBar from "./TopBar";
import SideButtons from "./SideButtons";

/** The whole planner: top month tabs, side jump buttons, virtualized feed. */
export default function PlannerShell() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [activeMonth, setActiveMonth] = useState(0);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  useEffect(() => {
    (async () => {
      const p = await ensurePlannerSeeded();
      const all = await db.pages
        .where("[plannerId+index]")
        .between([p.id, -Infinity], [p.id, Infinity])
        .toArray();
      setPlanner(p);
      setPages(all);
    })();
  }, []);

  const jumpToIndex = useCallback((index: number) => {
    virtuoso.current?.scrollToIndex({ index, align: "start", behavior: "smooth" });
  }, []);

  const jumpToMonth = useCallback(
    (m: number) => {
      const i = pagesRef.current.findIndex((p) => p.type === "month" && p.monthIndex === m);
      if (i >= 0) jumpToIndex(i);
    },
    [jumpToIndex]
  );

  const currentWeekIndex = useCallback((): number => {
    const all = pagesRef.current;
    const today = toISO(new Date());
    const exact = all.findIndex(
      (p) => p.type === "week" && p.dateStart <= today && today <= p.dateEnd
    );
    if (exact >= 0) return exact;
    // Outside the planner year: clamp to first/last week.
    const weeks = all.filter((p) => p.type === "week");
    if (weeks.length === 0) return 0;
    const target = today < weeks[0].dateStart ? weeks[0] : weeks[weeks.length - 1];
    return all.findIndex((p) => p.id === target.id);
  }, []);

  const jumpToTarget = useCallback(
    (target: string) => {
      if (target === "current-week") {
        jumpToIndex(currentWeekIndex());
        return;
      }
      const i = pagesRef.current.findIndex(
        (p) => p.type === "section" && p.meta.sectionKey === target
      );
      if (i >= 0) jumpToIndex(i);
    },
    [jumpToIndex, currentWeekIndex]
  );

  const onRangeChanged = useCallback((range: ListRange) => {
    const all = pagesRef.current;
    if (all.length === 0) return;
    const mid = all[Math.min(Math.floor((range.startIndex + range.endIndex) / 2), all.length - 1)];
    // Keep the last month highlight while on year/section pages.
    if (mid.monthIndex >= 0) setActiveMonth(mid.monthIndex);
  }, []);

  if (!planner || pages.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-600">
        Preparing your planner…
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        activeMonth={activeMonth}
        yearLabel={`'${String(planner.year).slice(2)}`}
        onJumpMonth={jumpToMonth}
        onJumpYear={() => jumpToIndex(0)}
      />
      <div className="relative min-h-0 flex-1 bg-slate-400/60">
        <SideButtons onJump={jumpToTarget} />
        <Virtuoso
          ref={virtuoso}
          data={pages}
          computeItemKey={(_, page) => page.id}
          increaseViewportBy={{ top: 800, bottom: 800 }}
          rangeChanged={onRangeChanged}
          itemContent={(_, page) => (
            <div className="px-2 py-1.5 pr-12" data-page-index={page.index} data-page-label={page.label}>
              <PageView page={page} />
            </div>
          )}
          style={{ height: "100%" }}
        />
      </div>
    </div>
  );
}
