"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle, type ListRange } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import type { Planner } from "@/lib/db/types";
import { db } from "@/lib/db/db";
import { ensurePlannerSeeded } from "@/lib/planner/generate";
import { toISO } from "@/lib/planner/dates";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { PEN_COLORS, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import {
  addBlock,
  duplicatePage,
  getClipboardBlock,
  makeImageBlock,
  makeTextBlock,
  pasteClipboardBlock,
} from "@/lib/blocks/actions";
import { ensureStarterCategories } from "@/lib/categories/actions";
import PageView from "./pages/PageView";
import TopBar from "./TopBar";
import SideButtons from "./SideButtons";
import Toolbar from "./Toolbar";
import InkCanvas from "./InkCanvas";
import BlocksLayer from "./BlocksLayer";
import HabitGrid from "./HabitGrid";
import ManageDialog from "./ManageDialog";
import { PlannerUIContext, type PlannerUI } from "./ui-context";

/** The whole planner: tabs, side buttons, toolbar, virtualized ink-enabled feed. */
export default function PlannerShell() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [activeMonth, setActiveMonth] = useState(0);
  const [tool, setTool] = useState<ToolId>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0].color);
  const [penWidth, setPenWidth] = useState(PEN_COLORS[0].width);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const scrollerEl = useRef<HTMLElement | null>(null);

  const [showManage, setShowManage] = useState(false);

  useEffect(() => {
    void ensurePlannerSeeded().then(async (p) => {
      await ensureStarterCategories(p.id);
      setPlanner(p);
    });
  }, []);

  const pages = useLiveQuery(
    () =>
      planner
        ? db.pages
            .where("[plannerId+index]")
            .between([planner.id, -Infinity], [planner.id, Infinity])
            .toArray()
        : [],
    [planner?.id]
  );

  const pagesRef = useRef<NonNullable<typeof pages>>([]);
  pagesRef.current = pages ?? [];

  /** Page whose rendered element is closest to the viewport center — the one
   *  the user is actually looking at (paste / duplicate target). */
  const viewportCenterPageId = useCallback((): string | null => {
    const scroller = scrollerEl.current;
    const all = pagesRef.current;
    if (!scroller || all.length === 0) return null;
    const centerY = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    let best: { id: string; dist: number } | null = null;
    for (const el of scroller.querySelectorAll<HTMLElement>("[data-page-index]")) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs((r.top + r.bottom) / 2 - centerY);
      const page = all[Number(el.dataset.pageIndex)];
      if (page && (!best || dist < best.dist)) best = { id: page.id, dist };
    }
    return best?.id ?? null;
  }, []);

  const ui = useMemo<PlannerUI>(
    () => ({
      tool,
      penColor,
      penWidth,
      setTool,
      setPen: (c, w) => {
        setPenColor(c);
        setPenWidth(w);
      },
      selectedBlockId,
      setSelectedBlockId,
      currentPageId,
      setPenActive: (active) => {
        if (scrollerEl.current) scrollerEl.current.style.touchAction = active ? "none" : "";
      },
    }),
    [tool, penColor, penWidth, selectedBlockId, currentPageId]
  );

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
    if (mid.monthIndex >= 0) setActiveMonth(mid.monthIndex);
    setCurrentPageId(mid.id);
  }, []);

  const pasteImage = useCallback(async (blob: Blob) => {
    const pageId = viewportCenterPageId();
    if (!pageId) return;
    const block = await makeImageBlock(pageId, blob, PAGE_W * 0.25, PAGE_H * 0.3);
    await addBlock(block);
    setTool("select");
    setSelectedBlockId(block.id);
  }, []);

  // Global clipboard + keyboard shortcuts.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return;
      const items = e.clipboardData?.items ?? [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            void pasteImage(blob);
            return;
          }
        }
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const internal = getClipboardBlock();
      const pageId = viewportCenterPageId();
      if (!pageId) return;
      e.preventDefault();
      // Fresh OS-clipboard text wins over a previously copied block — unless the
      // text IS that block's content (then paste the richer block clone).
      if (internal && (internal.content === text || !text.trim())) {
        void pasteClipboardBlock(pageId).then((b) => b && setSelectedBlockId(b.id));
      } else if (text.trim()) {
        const block = makeTextBlock(pageId, PAGE_W * 0.3, PAGE_H * 0.35, text);
        void addBlock(block).then(() => {
          setTool("select");
          setSelectedBlockId(block.id);
        });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void history.undo();
      } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        void history.redo();
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [pasteImage]);

  const onAddImage = useCallback((file: File) => void pasteImage(file), [pasteImage]);

  const onDuplicatePage = useCallback(() => {
    const pageId = viewportCenterPageId();
    if (pageId) void duplicatePage(pageId);
  }, [viewportCenterPageId]);

  const onExport = useCallback(
    async (scope: "year" | "page") => {
      const { exportPdf } = await import("@/lib/pdf/export");
      const pageId = scope === "page" ? (viewportCenterPageId() ?? undefined) : undefined;
      const bytes = await exportPdf({ scope, pageId });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = scope === "year" ? "jos-planner-2026.pdf" : "jos-planner-page.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [viewportCenterPageId]
  );

  if (!planner || !pages || pages.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-600">
        Preparing your planner…
      </main>
    );
  }

  return (
    <PlannerUIContext.Provider value={ui}>
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
            scrollerRef={(el) => {
              scrollerEl.current = (el as HTMLElement) ?? null;
            }}
            data={pages}
            computeItemKey={(_, page) => page.id}
            increaseViewportBy={{ top: 800, bottom: 800 }}
            rangeChanged={onRangeChanged}
            itemContent={(_, page) => (
              <div className="px-2 py-1.5 pr-12" data-page-index={page.index} data-page-label={page.label}>
                <div className="relative overflow-hidden rounded-md" style={{ containerType: "inline-size" }}>
                  <PageView page={page} />
                  <BlocksLayer pageId={page.id} />
                  <InkCanvas pageId={page.id} />
                  {page.type === "week" && <HabitGrid page={page} plannerId={planner.id} />}
                </div>
              </div>
            )}
            style={{ height: "100%" }}
          />
        </div>
        <Toolbar
          onAddImage={onAddImage}
          onDuplicatePage={onDuplicatePage}
          onOpenManage={() => setShowManage(true)}
          onExport={(scope) => void onExport(scope)}
        />
        {showManage && <ManageDialog plannerId={planner.id} onClose={() => setShowManage(false)} />}
      </div>
    </PlannerUIContext.Provider>
  );
}
