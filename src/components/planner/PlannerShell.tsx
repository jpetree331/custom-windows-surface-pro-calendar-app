"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle, type ListRange } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import type { Planner } from "@/lib/db/types";
import { db } from "@/lib/db/db";
import { ensurePlannerSeeded } from "@/lib/planner/generate";
import { currentWeekPageIndex, preferOriginalIndex } from "@/lib/planner/navigation";
import { toISO } from "@/lib/planner/dates";
import { PAGE_W, PAGE_H, PLANNER_YEAR } from "@/lib/planner/constants";
import { PEN_COLORS, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import {
  addBlankPage,
  addBlock,
  copyPageToClipboard,
  deletePage,
  duplicatePage,
  getClipboardBlock,
  hasPageClipboard,
  makeImageBlock,
  makeTextBlock,
  pasteClipboardBlock,
  pastePageAfter,
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
import SinglePageFeed from "./SinglePageFeed";
import {
  loadViewSettings,
  saveViewSettings,
  pageWidthFor,
  DEFAULT_VIEW_SETTINGS,
  type ViewSettings,
} from "@/lib/planner/view-settings";
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
  const [showAddPage, setShowAddPage] = useState(false);
  const [addPageAnchor, setAddPageAnchor] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pageId: string; label: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Layout Options (Jo's Drawboard defaults: Single Page + Fit to Page)
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);
  const [singleIndex, setSingleIndex] = useState(0);
  const [feedBox, setFeedBox] = useState({ w: 0, h: 0 });
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => setViewSettings(loadViewSettings()), []);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFeedBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setFeedBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [planner]);

  const [allYears, setAllYears] = useState<number[]>([]);
  const loadYearSeq = useRef(0);

  const loadYear = useCallback(async (year: number) => {
    const req = ++loadYearSeq.current;
    const p = await ensurePlannerSeeded(year);
    await ensureStarterCategories(p.id);
    const years = (await db.planners.toArray()).map((pl) => pl.year).sort();
    // A newer loadYear superseded this one mid-flight — drop the stale result.
    if (req !== loadYearSeq.current) return;
    localStorage.setItem("jotter.activeYear", String(year));
    history.setActivePlanner(p.id);
    setAllYears(years);
    setPlanner(p);
  }, []);

  useEffect(() => {
    const saved = Number(localStorage.getItem("jotter.activeYear"));
    void loadYear(saved >= 2020 && saved <= 2100 ? saved : PLANNER_YEAR);
  }, [loadYear]);

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

  const viewSettingsRef = useRef(viewSettings);
  viewSettingsRef.current = viewSettings;
  const singleIndexRef = useRef(singleIndex);
  singleIndexRef.current = singleIndex;

  /** Page whose rendered element is closest to the viewport center — the one
   *  the user is actually looking at (paste / duplicate target). */
  const viewportCenterPageId = useCallback((): string | null => {
    if (viewSettingsRef.current.layout === "single") {
      return pagesRef.current[singleIndexRef.current]?.id ?? null;
    }
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

  const syncPagePosition = useCallback((index: number) => {
    const page = pagesRef.current[index];
    if (!page) return;
    if (page.monthIndex >= 0) setActiveMonth(page.monthIndex);
    setCurrentPageId(page.id);
  }, []);

  const changeViewSettings = useCallback(
    (s: ViewSettings) => {
      // Keep the reader's place when flipping Single ↔ Continuous.
      if (s.layout !== viewSettingsRef.current.layout) {
        const pid = viewportCenterPageId();
        const i = pagesRef.current.findIndex((p) => p.id === pid);
        if (i >= 0) {
          setSingleIndex(i); // single mode shows it; continuous mounts at it
          syncPagePosition(i);
        }
      }
      setViewSettings(s);
      saveViewSettings(s);
    },
    [viewportCenterPageId, syncPagePosition]
  );

  const jumpToIndex = useCallback(
    (index: number) => {
      if (viewSettingsRef.current.layout === "single") {
        setSingleIndex(index);
        syncPagePosition(index);
      } else {
        virtuoso.current?.scrollToIndex({ index, align: "start", behavior: "smooth" });
      }
    },
    [syncPagePosition]
  );

  const ui = useMemo<PlannerUI>(
    () => ({
      plannerId: planner?.id ?? "",
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
      jumpToDate: (iso: string) => {
        const i = currentWeekPageIndex(pagesRef.current, iso);
        if (i >= 0) jumpToIndex(i);
      },
      setPenActive: (active) => {
        if (scrollerEl.current) scrollerEl.current.style.touchAction = active ? "none" : "";
      },
    }),
    [planner?.id, tool, penColor, penWidth, selectedBlockId, currentPageId, jumpToIndex]
  );

  const jumpToMonth = useCallback(
    (m: number) => {
      const i = preferOriginalIndex(
        pagesRef.current,
        (p) => p.type === "month" && p.monthIndex === m
      );
      if (i >= 0) jumpToIndex(i);
    },
    [jumpToIndex]
  );

  // Recomputed from today's date on EVERY click — ✱ rolls over each Monday
  // (and every other day) without any refresh or timer.
  const currentWeekIndex = useCallback(
    () => currentWeekPageIndex(pagesRef.current, toISO(new Date())),
    []
  );

  const jumpToTarget = useCallback(
    (target: string) => {
      if (target === "current-week") {
        jumpToIndex(currentWeekIndex());
        return;
      }
      const i = preferOriginalIndex(
        pagesRef.current,
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
      return (
        !!el &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      );
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

  // On open (and when switching years), Single Page mode lands on the current week.
  const landedPlanner = useRef<string | null>(null);
  useEffect(() => {
    if (!planner || !pages || pages.length === 0) return;
    if (pages[0].plannerId !== planner.id) return; // liveQuery still on old year
    if (landedPlanner.current === planner.id) return;
    landedPlanner.current = planner.id;
    const i = currentWeekPageIndex(pages, toISO(new Date()));
    setSingleIndex(Math.max(0, i));
    syncPagePosition(Math.max(0, i));
  }, [planner, pages, syncPagePosition]);

  const onDuplicatePage = useCallback(() => {
    const pageId = viewportCenterPageId();
    if (pageId) void duplicatePage(pageId);
  }, [viewportCenterPageId]);

  const onAddPage = useCallback(
    async (label: string, anchorId?: string | null) => {
      const anchor = anchorId ?? viewportCenterPageId();
      if (!anchor) return;
      const page = await addBlankPage(anchor, label);
      if (page) {
        // liveQuery refresh lands within a tick; then scroll to the new page
        setTimeout(() => jumpToIndex(page.index), 200);
      }
    },
    [viewportCenterPageId, jumpToIndex]
  );

  const onExport = useCallback(
    async (scope: "year" | "page") => {
      const { exportPdf } = await import("@/lib/pdf/export");
      const pageId = scope === "page" ? (viewportCenterPageId() ?? undefined) : undefined;
      const bytes = await exportPdf({ scope, pageId, plannerId: planner?.id });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = scope === "year" ? `jos-planner-${planner?.year ?? ""}.pdf` : "jos-planner-page.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [viewportCenterPageId, planner]
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
          years={allYears}
          activeYear={planner.year}
          onJumpMonth={jumpToMonth}
          onJumpYear={() => jumpToIndex(0)}
          onSwitchYear={(y) => void loadYear(y)}
          onCreateYear={(y) => void loadYear(y)}
        />
        <div ref={feedRef} className="relative min-h-0 flex-1 bg-slate-400/60">
          <SideButtons onJump={jumpToTarget} />
          {viewSettings.layout === "single" ? (
            <SinglePageFeed
              pages={pages}
              index={singleIndex}
              onIndexChange={(i) => {
                setSingleIndex(i);
                syncPagePosition(i);
              }}
              scrollerRef={(el) => {
                scrollerEl.current = el;
              }}
              settings={viewSettings}
              renderPage={(page) => (
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setConfirmDelete(false);
                    setCtxMenu({ x: e.clientX, y: e.clientY, pageId: page.id, label: page.label });
                  }}
                >
                  <div className="relative overflow-hidden rounded-md" style={{ containerType: "inline-size" }}>
                    <PageView page={page} />
                    <BlocksLayer pageId={page.id} />
                    <InkCanvas pageId={page.id} />
                    {page.type === "week" && <HabitGrid page={page} plannerId={planner.id} />}
                  </div>
                </div>
              )}
            />
          ) : (
            <Virtuoso
              ref={virtuoso}
              scrollerRef={(el) => {
                scrollerEl.current = (el as HTMLElement) ?? null;
                if (el) (el as HTMLElement).style.overflowX = "auto";
              }}
              data={pages}
              computeItemKey={(_, page) => page.id}
              initialTopMostItemIndex={singleIndex}
              increaseViewportBy={{ top: 800, bottom: 800 }}
              rangeChanged={onRangeChanged}
              itemContent={(_, page) => (
                <div
                  className="px-2 py-1.5 pr-12"
                  data-page-index={page.index}
                  data-page-label={page.label}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setConfirmDelete(false);
                    setCtxMenu({ x: e.clientX, y: e.clientY, pageId: page.id, label: page.label });
                  }}
                >
                  <div
                    className="relative mx-auto overflow-hidden rounded-md"
                    style={{
                      containerType: "inline-size",
                      width: pageWidthFor(viewSettings, feedBox.w - 56, feedBox.h - 12, PAGE_W / PAGE_H),
                    }}
                  >
                    <PageView page={page} />
                    <BlocksLayer pageId={page.id} />
                    <InkCanvas pageId={page.id} />
                    {page.type === "week" && <HabitGrid page={page} plannerId={planner.id} />}
                  </div>
                </div>
              )}
              style={{ height: "100%" }}
            />
          )}
        </div>
        <Toolbar
          onAddImage={onAddImage}
          onDuplicatePage={onDuplicatePage}
          onAddPage={() => setShowAddPage(true)}
          onOpenManage={() => setShowManage(true)}
          onExport={(scope) => void onExport(scope)}
          viewSettings={viewSettings}
          onChangeViewSettings={changeViewSettings}
        />
        {ctxMenu && (
          <div className="fixed inset-0 z-50" data-page-context-menu onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}>
            <div
              className="absolute w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
              style={{
                left: Math.min(ctxMenu.x, window.innerWidth - 240),
                top: Math.min(ctxMenu.y, window.innerHeight - 260),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                {ctxMenu.label}
              </div>
              {[
                {
                  key: "add",
                  label: "＋ Add page (after this one)…",
                  run: () => {
                    setAddPageAnchor(ctxMenu.pageId);
                    setShowAddPage(true);
                    setCtxMenu(null);
                  },
                },
                {
                  key: "copy",
                  label: "⿻ Copy page",
                  run: () => {
                    void copyPageToClipboard(ctxMenu.pageId);
                    setCtxMenu(null);
                  },
                },
                ...(hasPageClipboard()
                  ? [{
                      key: "paste",
                      label: "📋 Paste page (after this one)",
                      run: () => {
                        void pastePageAfter(ctxMenu.pageId).then(
                          (p) => p && setTimeout(() => jumpToIndex(p.index), 200)
                        );
                        setCtxMenu(null);
                      },
                    }]
                  : []),
                {
                  key: "duplicate",
                  label: "⧉ Duplicate page",
                  run: () => {
                    void duplicatePage(ctxMenu.pageId);
                    setCtxMenu(null);
                  },
                },
              ].map((item) => (
                <button
                  key={item.key}
                  data-menu-item={item.key}
                  onClick={item.run}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {item.label}
                </button>
              ))}
              {confirmDelete ? (
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="font-semibold text-red-700">Delete this page?</span>
                  <button
                    data-menu-item="delete-confirm"
                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
                    onClick={() => {
                      void deletePage(ctxMenu.pageId);
                      setCtxMenu(null);
                    }}
                  >
                    Delete
                  </button>
                  <button className="text-xs text-slate-500 underline" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  data-menu-item="delete"
                  onClick={() => setConfirmDelete(true)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  ✕ Delete page… <span className="text-xs text-slate-400">(undo restores it)</span>
                </button>
              )}
            </div>
          </div>
        )}
        {showManage && (
          <ManageDialog plannerId={planner.id} year={planner.year} onClose={() => setShowManage(false)} />
        )}
        {showAddPage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            data-add-page-dialog
            onClick={() => setShowAddPage(false)}
          >
            <form
              className="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                setShowAddPage(false);
                void onAddPage(newPageName, addPageAnchor);
                setAddPageAnchor(null);
                setNewPageName("");
              }}
            >
              <h2 className="mb-2 text-base font-bold text-slate-800">New page</h2>
              <input
                autoFocus
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                placeholder="Page name (e.g. GIFT IDEAS)"
                data-input="new-page-name"
                className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPage(false)}
                  className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
                  Add after this page
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </PlannerUIContext.Provider>
  );
}
