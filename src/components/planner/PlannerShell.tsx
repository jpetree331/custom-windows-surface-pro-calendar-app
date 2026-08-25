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
import { ERASER_RADIUS_PT, PEN_COLORS, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import {
  addBlankPage,
  addBlock,
  copyBlockToClipboard,
  copyPageToClipboard,
  copySelectionToClipboard,
  deleteBlock,
  deletePage,
  duplicatePage,
  getClipboardBlock,
  hasPageClipboard,
  hasSelectionClipboard,
  internalClipboardAt,
  makeImageBlock,
  makeTextBlock,
  pasteAnyClipboardCentered,
  pasteClipboardBlock,
  pastePageAfter,
  pasteSelectionAt,
  renamePage,
} from "@/lib/blocks/actions";
import { getTimeFormat, setTimeFormat as persistTimeFormat, type TimeFormat } from "@/lib/settings";
import { PLANNER_SLUG } from "@/lib/branding";
import { saveFile } from "@/lib/save";
import { maybeAutoSync, recordManualSync } from "@/lib/google/autosync";
import { importYear, purgeMoonPhaseDuplicates } from "@/lib/google/import";
import { getAccessToken, googleClientId } from "@/lib/google/auth";
import { ensureStarterCategories } from "@/lib/categories/actions";
import { addSideButton, ensureSideButtonsSeeded } from "@/lib/planner/sideButtons";
import NotepadManager from "./notepad/NotepadManager";
import PageView from "./pages/PageView";
import TopBar from "./TopBar";
import SideButtons from "./SideButtons";
import SideButtonEditor from "./SideButtonEditor";
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
import SelectionOverlay from "./SelectionOverlay";
import { PlannerUIContext, type AreaSelection, type PlannerUI } from "./ui-context";

/** The whole planner: tabs, side buttons, toolbar, virtualized ink-enabled feed. */
export default function PlannerShell() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [activeMonth, setActiveMonth] = useState(0);
  const [tool, setTool] = useState<ToolId>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0].color);
  const [penWidth, setPenWidth] = useState(PEN_COLORS[0].width);
  const [eraserRadius, setEraserRadiusState] = useState(() => {
    if (typeof localStorage === "undefined") return ERASER_RADIUS_PT;
    const saved = Number(localStorage.getItem("jotter.eraserRadius"));
    return saved >= 2 && saved <= 20 ? saved : ERASER_RADIUS_PT;
  });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selection, setSelection] = useState<AreaSelection | null>(null);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const scrollerEl = useRef<HTMLElement | null>(null);

  const [showManage, setShowManage] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [addPageAnchor, setAddPageAnchor] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState("");
  const [addPageSideBtn, setAddPageSideBtn] = useState(false);
  const [manageFocus, setManageFocus] = useState<"side-buttons" | null>(null);
  const [notepadMenu, setNotepadMenu] = useState<{ top: number; right: number } | null>(null);
  const [buttonEditor, setButtonEditor] = useState<{ top: number; right: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ pageId: string; label: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const imageFileRef = useRef<HTMLInputElement>(null);
  const imageTargetRef = useRef<{ pageId: string; x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
    label: string;
    sectionKey: string;
    /** click point in page-logical coords (for Paste selection here). */
    pageX: number;
    pageY: number;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("12h");
  useEffect(() => setTimeFormatState(getTimeFormat()), []);

  // Layout Options (Jo's Drawboard defaults: Single Page + Fit to Page)
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);
  const [singleIndex, setSingleIndex] = useState(0);
  const [feedBox, setFeedBox] = useState({ w: 0, h: 0 });
  // Callback ref, NOT a plain ref: the feed div mounts AFTER the "Preparing…"
  // guard clears, so effects keyed on planner would run too early and never
  // see the element. State-as-ref re-fires the effects exactly on mount.
  const [feedEl, setFeedEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => setViewSettings(loadViewSettings()), []);
  useEffect(() => {
    if (!feedEl) return;
    const ro = new ResizeObserver(() => setFeedBox({ w: feedEl.clientWidth, h: feedEl.clientHeight }));
    ro.observe(feedEl);
    setFeedBox({ w: feedEl.clientWidth, h: feedEl.clientHeight });
    return () => ro.disconnect();
  }, [feedEl]);

  const [allYears, setAllYears] = useState<number[]>([]);
  const loadYearSeq = useRef(0);

  const loadYear = useCallback(async (year: number) => {
    const req = ++loadYearSeq.current;
    const p = await ensurePlannerSeeded(year);
    await ensureStarterCategories(p.id);
    await ensureSideButtonsSeeded(p.id);
    // Local-only cleanup, so it must NOT wait for a Google sync: Jo's stale
    // moon-phase rows outlived round 10's purge because her auto-sync token
    // had lapsed and importYear (the only caller) never ran.
    void purgeMoonPhaseDuplicates(p.id);
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
  const toolRef = useRef(tool);
  toolRef.current = tool;
  /** True while a pen stroke is in progress — palm touches must do nothing. */
  const penActiveRef = useRef(false);

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

  /** Where a paste lands: the note she's working in, else the page in view. */
  const pasteTargetPageId = useCallback(
    (): string | null => activeNoteRef.current ?? viewportCenterPageId(),
    [viewportCenterPageId]
  );

  const syncPagePosition = useCallback((index: number) => {
    const page = pagesRef.current[index];
    if (!page) return;
    if (page.monthIndex >= 0) setActiveMonth(page.monthIndex);
    setCurrentPageId(page.id);
  }, []);

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

  const flipPage = useCallback(
    (dir: 1 | -1) => {
      if (viewSettingsRef.current.layout === "single") {
        const next = singleIndexRef.current + dir;
        if (next >= 0 && next < pagesRef.current.length) jumpToIndex(next);
      } else {
        scrollerEl.current?.scrollBy({
          top: dir * scrollerEl.current.clientHeight * 0.95,
          behavior: "smooth",
        });
      }
    },
    [jumpToIndex]
  );

  // ONE owner for every touch gesture over the planner, regardless of tool or
  // element under the finger: 1 finger = pan + book-swipe page flip, 2 fingers
  // = app zoom, Ctrl+wheel = app zoom. preventDefault stops the browser's own
  // scrolling AND the whole-app overscroll rubber-band Jo hit.
  useEffect(() => {
    const el = feedEl;
    if (!el) return;
    let pinchBase: { dist: number; zoom: number } | null = null;
    const clamp = (z: number) => Math.min(3, Math.max(0.5, Math.round(z * 20) / 20));
    const applyZoom = (zoom: number, persist: boolean) => {
      if (zoom !== viewSettingsRef.current.zoom) {
        const next = { ...viewSettingsRef.current, zoom };
        setViewSettings(next);
        if (persist) saveViewSettings(next);
      } else if (persist) {
        saveViewSettings(viewSettingsRef.current);
      }
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    let pan: {
      id: number;
      lastX: number;
      lastY: number;
      totX: number;
      totY: number;
      t0: number;
    } | null = null;
    // Elements that own their own touch interactions — never start a pan there.
    const INTERACTIVE =
      "[data-block-id],[data-selection-box],[data-notepad-window],button,input,select,textarea,a,[contenteditable='true']";

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchBase = { dist: dist(e.touches), zoom: viewSettingsRef.current.zoom };
        pan = null;
        return;
      }
      if (e.touches.length !== 1) return;
      if (penActiveRef.current) return; // palm while the pen is writing
      const t = e.touches[0];
      const target = t.target as HTMLElement;
      if (target.closest?.(INTERACTIVE)) return;
      // finger-drawn marquee boxes go to the ink canvas, not panning
      if (toolRef.current === "marquee" && target.closest?.("canvas[data-ink-canvas]")) return;
      pan = {
        id: t.identifier,
        lastX: t.clientX,
        lastY: t.clientY,
        totX: 0,
        totY: 0,
        t0: performance.now(),
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        pan = null;
        e.preventDefault(); // stop the browser from pinch-zooming the viewport
        if (!pinchBase) pinchBase = { dist: dist(e.touches), zoom: viewSettingsRef.current.zoom };
        applyZoom(clamp(pinchBase.zoom * (dist(e.touches) / pinchBase.dist)), false);
        return;
      }
      if (!pan || penActiveRef.current) return;
      const t = Array.from(e.touches).find((tt) => tt.identifier === pan!.id);
      if (!t) return;
      e.preventDefault(); // we own the gesture — no native scroll, no app-wide rubber-band
      const dx = t.clientX - pan.lastX;
      const dy = t.clientY - pan.lastY;
      pan.lastX = t.clientX;
      pan.lastY = t.clientY;
      pan.totX += dx;
      pan.totY += dy;
      scrollerEl.current?.scrollBy(-dx, -dy);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinchBase && e.touches.length < 2) {
        pinchBase = null;
        saveViewSettings(viewSettingsRef.current);
      }
      if (pan && !Array.from(e.touches).some((t) => t.identifier === pan!.id)) {
        const { totX, totY, t0 } = pan;
        pan = null;
        // Book-style swipe: fast, mostly-horizontal drag flips the page.
        if (performance.now() - t0 < 600 && Math.abs(totX) > 60 && Math.abs(totX) > 1.5 * Math.abs(totY)) {
          flipPage(totX < 0 ? 1 : -1);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // trackpad pinch + Ctrl+wheel arrive as ctrl+wheel
      e.preventDefault();
      applyZoom(clamp(viewSettingsRef.current.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)), true);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [feedEl, flipPage]);

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

  const ui = useMemo<PlannerUI>(
    () => ({
      plannerId: planner?.id ?? "",
      year: planner?.year ?? PLANNER_YEAR,
      tool,
      penColor,
      penWidth,
      setTool: (t) => {
        setSelection(null); // a tool change dismisses any area selection
        setTool(t);
      },
      setPen: (c, w) => {
        setPenColor(c);
        setPenWidth(w);
      },
      eraserRadius,
      setEraserRadius: (r: number) => {
        localStorage.setItem("jotter.eraserRadius", String(r));
        setEraserRadiusState(r);
      },
      selectedBlockId,
      setSelectedBlockId,
      selection,
      setSelection,
      timeFormat,
      setTimeFormat: (f: TimeFormat) => {
        persistTimeFormat(f);
        setTimeFormatState(f);
      },
      currentPageId,
      jumpToDate: (iso: string) => {
        const i = currentWeekPageIndex(pagesRef.current, iso);
        if (i >= 0) jumpToIndex(i);
      },
      setPenActive: (active) => {
        penActiveRef.current = active; // feed-level pan checks this (palm rejection)
        if (scrollerEl.current) scrollerEl.current.style.touchAction = active ? "none" : "";
      },
      panBy: (dx, dy) => {
        scrollerEl.current?.scrollBy(-dx, -dy);
      },
      flipPage,
    }),
    [planner?.id, planner?.year, tool, penColor, penWidth, eraserRadius, selectedBlockId, selection, timeFormat, currentPageId, jumpToIndex, flipPage]
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
      // "page:<id>" = a custom titled page; a deleted target is a quiet no-op
      if (target.startsWith("page:")) {
        const i = pagesRef.current.findIndex((p) => p.id === target.slice(5));
        if (i >= 0) jumpToIndex(i);
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

  const pasteImage = useCallback(
    async (blob: Blob, target?: { pageId: string; x: number; y: number }) => {
      const pageId = target?.pageId ?? pasteTargetPageId();
      if (!pageId) return;
      const block = await makeImageBlock(
        pageId, blob, target?.x ?? PAGE_W * 0.25, target?.y ?? PAGE_H * 0.3
      );
      await addBlock(block);
      setTool("select");
      setSelectedBlockId(block.id);
    },
    []
  );

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectedBlockIdRef = useRef(selectedBlockId);
  selectedBlockIdRef.current = selectedBlockId;
  /** The focused note's page id — Ctrl+V while a note has focus must paste
   *  INTO the note, not onto the calendar page hidden behind it (r11 review). */
  const activeNoteRef = useRef<string | null>(null);

  /** Paste the ⬚ clipboard onto the page in view, centered, and SELECT the
   *  result so it's visibly there and immediately draggable. Honors a
   *  focused note, so ink cut from a calendar page lands IN the note she's
   *  looking at rather than the page behind it (Jo r12). */
  const pasteSelectionCentered = useCallback(async () => {
    if (!hasSelectionClipboard()) return false;
    const pageId = pasteTargetPageId();
    if (!pageId) return false;
    const result = await pasteSelectionAt(pageId, PAGE_W / 2, PAGE_H / 2);
    if (result) setSelection(result);
    return !!result;
  }, [viewportCenterPageId]);

  // Global clipboard + keyboard shortcuts.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      );
    };

    // Ctrl+V bookkeeping: the browser only fires `paste` when the OS
    // clipboard has something. r11 answered that by hijacking the keystroke,
    // which meant that once ANYTHING had been copied inside the app, text and
    // images copied from outside could never arrive (Jo r13). Now the native
    // event always gets first refusal and the app's own clipboard is the
    // fallback when no event shows up.
    let nativePasteSeen = false;
    let pasteFallback = 0;
    // The OS clipboard carries no timestamp, so this stands in for one: it can
    // only have been refilled while Jo was in another program.
    let leftAppAt = 0;
    const onLeaveApp = () => {
      leftAppAt = Date.now();
    };
    const onVisibility = () => {
      if (document.hidden) onLeaveApp();
    };
    const pasteInternal = () => {
      const pageId = pasteTargetPageId();
      if (!pageId) return;
      void pasteAnyClipboardCentered(pageId).then((r) => {
        if (!r) return;
        if (r.kind === "selection") setSelection(r.selection);
        else setSelectedBlockId(r.block.id);
      });
    };

    const onPaste = (e: ClipboardEvent) => {
      nativePasteSeen = true;
      window.clearTimeout(pasteFallback);
      if (isTyping()) return; // typing in a box: let the browser paste text
      // Copied something HERE more recently than she was last away? Then the
      // OS clipboard is a leftover — a cut ⬚ selection must not lose to the
      // text of a block she copied ten minutes ago (Jo r13).
      if (
        (hasSelectionClipboard() || getClipboardBlock()) &&
        internalClipboardAt() > leftAppAt
      ) {
        e.preventDefault();
        pasteInternal();
        return;
      }
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
      const pageId = pasteTargetPageId();
      if (!pageId) return;
      const internal = getClipboardBlock();
      if (text.trim()) {
        e.preventDefault();
        // Text from outside lands as a new box — unless it IS the copied
        // block's own text, in which case paste the richer clone.
        if (internal && internal.content === text) {
          void pasteClipboardBlock(pageId).then((b) => b && setSelectedBlockId(b.id));
        } else {
          const block = makeTextBlock(pageId, PAGE_W * 0.3, PAGE_H * 0.35, text);
          void addBlock(block).then(() => {
            setTool("select");
            setSelectedBlockId(block.id);
          });
        }
        return;
      }
      // Nothing usable from the OS clipboard → use the app's own.
      if (hasSelectionClipboard() || internal) {
        e.preventDefault();
        pasteInternal();
      }
    };

    // Ctrl+C/X also cover a SINGLE selected item (Jo r11) — round 10's
    // "one item promotes to an item selection" left the hotkeys area-only.
    const copySelectedBlock = async (cut: boolean) => {
      const id = selectedBlockIdRef.current;
      if (!id) return false;
      const block = await db.blocks.get(id);
      if (!block) return false;
      copyBlockToClipboard(block);
      if (cut) {
        await deleteBlock(block); // Ctrl+Z restores
        setSelectedBlockId(null);
      }
      return true;
    };

    /** Text the user has actually highlighted in a contenteditable — then
     *  the browser's own copy/cut must win. */
    const textHighlighted = () => {
      const s = window.getSelection();
      return !!s && !s.isCollapsed && s.toString().length > 0;
    };

    const onKey = (e: KeyboardEvent) => {
      const sel = selectionRef.current;
      const appSel = sel || selectedBlockIdRef.current;
      // A note opens with its body text box focused (r11), so "typing" was
      // swallowing Ctrl+C/X for a marquee selection made inside that note
      // (Jo r12). Copy/cut may proceed ONLY when the focus is a
      // contenteditable (never a form field — window.getSelection() can't
      // see an <input>'s highlight, so we'd cut a stale block while she was
      // editing a title), something is selected in the app, and no text is
      // highlighted. Paste stays hands-off so a real text paste is never
      // hijacked; notes offer right-click → Paste instead.
      const el = document.activeElement as HTMLElement | null;
      const inFormField = !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      const copyKey = e.ctrlKey && ["c", "x"].includes(e.key.toLowerCase());
      if (isTyping() && !(copyKey && !inFormField && appSel && !textHighlighted())) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void history.undo();
      } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        void history.redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "c" && (sel || selectedBlockIdRef.current)) {
        e.preventDefault();
        if (sel) void copySelectionToClipboard(sel, false);
        else void copySelectedBlock(false);
      } else if (e.ctrlKey && e.key.toLowerCase() === "x" && (sel || selectedBlockIdRef.current)) {
        e.preventDefault();
        if (sel) {
          void copySelectionToClipboard(sel, true);
          setSelection(null);
        } else {
          void copySelectedBlock(true);
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === "v") {
        // Deliberately NOT preventDefault — see onPaste. If no paste event
        // arrives shortly (empty OS clipboard), paste the app's own.
        if (hasSelectionClipboard() || getClipboardBlock()) {
          nativePasteSeen = false;
          window.clearTimeout(pasteFallback);
          pasteFallback = window.setTimeout(() => {
            if (!nativePasteSeen) pasteInternal();
          }, 150);
        }
      } else if (e.key === "Escape") {
        setSelection(null);
        setSelectedBlockId(null);
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onLeaveApp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(pasteFallback);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onLeaveApp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pasteImage, pasteSelectionCentered]);

  // Scheduled Google auto-sync: checked shortly after launch and then every
  // few minutes; maybeAutoSync gates itself on the user's chosen interval.
  useEffect(() => {
    if (!planner) return;
    const tick = () => void maybeAutoSync(planner.id, planner.year);
    const first = setTimeout(tick, 5_000);
    const iv = setInterval(tick, 5 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [planner]);

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

  const onAddPage = useCallback(
    async (label: string, anchorId?: string | null) => {
      const anchor = anchorId ?? viewportCenterPageId();
      if (!anchor) return null;
      const page = await addBlankPage(anchor, label);
      if (page) {
        // liveQuery refresh lands within a tick; then scroll to the new page
        setTimeout(() => jumpToIndex(page.index), 200);
      }
      return page;
    },
    [viewportCenterPageId, jumpToIndex]
  );

  /** Toolbar 🔄 — same flow as Settings' "Connect & sync now", surfaced so
   *  the weekly Testing-mode re-consent is one visible tap. */
  const onSyncNow = useCallback(async () => {
    if (!planner) return { ok: false, message: "Planner not loaded yet" };
    try {
      const token = await getAccessToken();
      const r = await importYear(planner.id, planner.year, token);
      recordManualSync(planner.id); // resets the auto-sync clock too
      return {
        ok: true,
        message: `Synced: ${r.added} new, ${r.updated} refreshed${
          r.tasks ? `, ${r.tasks} tasks` : ""
        }${r.warnings.length ? ` — ${r.warnings[0]}` : ""}`,
      };
    } catch (err) {
      return { ok: false, message: String(err instanceof Error ? err.message : err) };
    }
  }, [planner]);

  const onExport = useCallback(
    async (req: { scope: "year" | "page" | "range"; fromIndex?: number; toIndex?: number }) => {
      const { exportPdf } = await import("@/lib/pdf/export");
      const pageId = req.scope === "page" ? (viewportCenterPageId() ?? undefined) : undefined;
      const bytes = await exportPdf({
        scope: req.scope,
        pageId,
        fromIndex: req.fromIndex,
        toIndex: req.toIndex,
        plannerId: planner?.id,
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const name =
        req.scope === "year"
          ? `${PLANNER_SLUG}-${planner?.year ?? ""}.pdf`
          : req.scope === "range"
            ? `${PLANNER_SLUG}-pages-${(req.fromIndex ?? 0) + 1}-${(req.toIndex ?? 0) + 1}.pdf`
            : `${PLANNER_SLUG}-page.pdf`;
      await saveFile(name, blob); // chosen folder if set, else browser download
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
        <div
          ref={setFeedEl}
          className="relative min-h-0 flex-1 bg-slate-400/60"
          // clicking back into the planner restores its Ctrl+Z scope after
          // working in a Notepad window (which switches to NOTES_SCOPE)
          onPointerDownCapture={() => {
            history.setActivePlanner(planner.id);
            activeNoteRef.current = null; // pastes target the planner again
          }}
        >
          <SideButtons
            plannerId={planner.id}
            onJump={jumpToTarget}
            onOpenNotepad={(anchor) => setNotepadMenu(anchor)}
            onOpenSettings={() => {
              setManageFocus("side-buttons");
              setShowManage(true);
            }}
            onOpenButtonEditor={setButtonEditor}
          />
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
                    const canvas = (e.currentTarget as HTMLElement).querySelector("canvas[data-ink-canvas]");
                    const r = canvas?.getBoundingClientRect();
                    const s = r ? PAGE_W / r.width : 1;
                    setCtxMenu({
                      x: e.clientX, y: e.clientY, pageId: page.id, label: page.label,
                      sectionKey: String(page.meta?.sectionKey ?? ""),
                      pageX: r ? (e.clientX - r.left) * s : PAGE_W / 2,
                      pageY: r ? (e.clientY - r.top) * s : PAGE_H / 2,
                    });
                  }}
                >
                  {/* isolation: block z-indexes (huge) stay INSIDE the page,
                      so fixed dialogs/menus always render above content */}
                  <div
                    className="relative overflow-hidden rounded-md"
                    style={{ containerType: "inline-size", isolation: "isolate" }}
                  >
                    <PageView page={page} />
                    <BlocksLayer pageId={page.id} />
                    <InkCanvas pageId={page.id} />
                    {page.type === "week" && <HabitGrid page={page} plannerId={planner.id} />}
                    {selection?.pageId === page.id && <SelectionOverlay />}
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
                    const canvas = (e.currentTarget as HTMLElement).querySelector("canvas[data-ink-canvas]");
                    const r = canvas?.getBoundingClientRect();
                    const s = r ? PAGE_W / r.width : 1;
                    setCtxMenu({
                      x: e.clientX, y: e.clientY, pageId: page.id, label: page.label,
                      sectionKey: String(page.meta?.sectionKey ?? ""),
                      pageX: r ? (e.clientX - r.left) * s : PAGE_W / 2,
                      pageY: r ? (e.clientY - r.top) * s : PAGE_H / 2,
                    });
                  }}
                >
                  <div
                    className="relative mx-auto overflow-hidden rounded-md"
                    style={{
                      containerType: "inline-size",
                      isolation: "isolate",
                      width: pageWidthFor(viewSettings, feedBox.w - 56, feedBox.h - 12, PAGE_W / PAGE_H),
                    }}
                  >
                    <PageView page={page} />
                    <BlocksLayer pageId={page.id} />
                    <InkCanvas pageId={page.id} />
                    {page.type === "week" && <HabitGrid page={page} plannerId={planner.id} />}
                    {selection?.pageId === page.id && <SelectionOverlay />}
                  </div>
                </div>
              )}
              style={{ height: "100%" }}
            />
          )}
        </div>
        {/* floating Notepad windows — siblings of the feed, so its pan/pinch
            listeners never see their events */}
        {buttonEditor && (
          <>
            <div
              className="fixed inset-0 z-[3200] print:hidden"
              data-side-editor-backdrop
              onClick={() => setButtonEditor(null)}
            />
            <div
              data-side-editor-popover
              className="fixed z-[3210] max-h-[70vh] w-[26rem] max-w-[92vw] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl print:hidden"
              style={{
                top: Math.min(buttonEditor.top, window.innerHeight - 320),
                right: buttonEditor.right,
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Side buttons
                </span>
                <button
                  data-side-editor-close
                  onClick={() => setButtonEditor(null)}
                  className="rounded px-2 text-lg leading-none text-slate-500 hover:bg-slate-100"
                >
                  ×
                </button>
              </div>
              <SideButtonEditor plannerId={planner.id} />
            </div>
          </>
        )}
        <NotepadManager
          menuAnchor={notepadMenu}
          onMenuClose={() => setNotepadMenu(null)}
          onNoteFocus={(noteId) => {
            activeNoteRef.current = noteId;
          }}
        />
        <Toolbar
          onOpenManage={() => setShowManage(true)}
          onExport={(req) => void onExport(req)}
          viewSettings={viewSettings}
          onChangeViewSettings={changeViewSettings}
          pageCount={pages.length}
          currentPageIndex={
            viewSettings.layout === "single"
              ? Math.min(singleIndex + 1, pages.length)
              : Math.max(1, pages.findIndex((p) => p.id === currentPageId) + 1)
          }
          onFlip={flipPage}
          onSyncNow={googleClientId() ? onSyncNow : null}
        />
        {ctxMenu && (
          // z-band 3200: dialogs/menus above floating notes (≤2600, Jo r11)
          <div className="fixed inset-0 z-[3200]" data-page-context-menu onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}>
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
                  key: "insert-image",
                  label: "🖼 Insert image…",
                  run: () => {
                    imageTargetRef.current = {
                      pageId: ctxMenu.pageId,
                      x: ctxMenu.pageX,
                      y: ctxMenu.pageY,
                    };
                    imageFileRef.current?.click();
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
                ...(hasSelectionClipboard()
                  ? [{
                      key: "paste-selection",
                      label: "📋 Paste",
                      run: () => {
                        void pasteSelectionAt(ctxMenu.pageId, ctxMenu.pageX, ctxMenu.pageY).then(
                          (result) => result && setSelection(result)
                        );
                        setCtxMenu(null);
                      },
                    }]
                  : []),
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
                // Only Jo's own added pages can be renamed — the calendar's
                // section pages keep their fixed names.
                ...(ctxMenu.sectionKey === "custom"
                  ? [{
                      key: "rename",
                      label: "✎ Rename page…",
                      run: () => {
                        setRenameTarget({ pageId: ctxMenu.pageId, label: ctxMenu.label });
                        setRenameDraft(ctxMenu.label);
                        setCtxMenu(null);
                      },
                    }]
                  : []),
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
          <ManageDialog
            plannerId={planner.id}
            year={planner.year}
            onClose={() => {
              setShowManage(false);
              setManageFocus(null);
            }}
            viewSettings={viewSettings}
            onChangeViewSettings={changeViewSettings}
            focusSection={manageFocus}
          />
        )}
        {/* hidden input for the right-click "Insert image…" item */}
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-input="insert-image-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const target = imageTargetRef.current;
            imageTargetRef.current = null;
            if (f) void pasteImage(f, target ?? undefined);
            e.target.value = "";
          }}
        />
        {renameTarget && (
          <div
            className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 p-4"
            data-rename-page-dialog
            onClick={() => setRenameTarget(null)}
          >
            <form
              className="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (renameDraft.trim()) void renamePage(renameTarget.pageId, renameDraft);
                setRenameTarget(null);
              }}
            >
              <h2 className="mb-2 text-base font-bold text-slate-800">Rename page</h2>
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                data-input="rename-page-name"
                className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
                  Rename
                </button>
              </div>
            </form>
          </div>
        )}
        {showAddPage && (
          <div
            className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 p-4"
            data-add-page-dialog
            onClick={() => setShowAddPage(false)}
          >
            <form
              className="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                setShowAddPage(false);
                const wantButton = addPageSideBtn;
                void onAddPage(newPageName, addPageAnchor).then((page) => {
                  if (page && wantButton) {
                    void addSideButton(page.plannerId, {
                      glyph: page.label.slice(0, 3),
                      label: page.label,
                      target: `page:${page.id}`,
                    });
                  }
                });
                setAddPageAnchor(null);
                setNewPageName("");
                setAddPageSideBtn(false);
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
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  data-input="add-side-button"
                  checked={addPageSideBtn}
                  onChange={(e) => setAddPageSideBtn(e.target.checked)}
                />
                Add a side button that jumps to this page
              </label>
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
