"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Page } from "@/lib/db/types";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { pageWidthFor, type ViewSettings } from "@/lib/planner/view-settings";

const ASPECT = PAGE_W / PAGE_H;

/**
 * Drawboard-style "Single Page" mode: exactly one page on screen; scrolling
 * flips page-by-page. Wheel flips at the page edge, PageUp/PageDown and the
 * edge arrows always flip; when zoomed past the viewport the page pans
 * natively (touch or scrollbars) and flips once you hit the bottom/top.
 */
export default function SinglePageFeed({
  pages,
  index,
  onIndexChange,
  settings,
  renderPage,
  scrollerRef,
}: {
  pages: Page[];
  index: number;
  onIndexChange: (i: number) => void;
  settings: ViewSettings;
  renderPage: (page: Page) => ReactNode;
  /** Exposes the scrollable host so palm rejection can lock touch-action. */
  scrollerRef?: (el: HTMLElement | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const wheelAccum = useRef(0);
  const clampedIndex = Math.min(Math.max(0, index), pages.length - 1);
  const page = pages[clampedIndex];

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setBox({ w: el.clientWidth, h: el.clientHeight })
    );
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const flip = useCallback(
    (dir: 1 | -1) => {
      const next = clampedIndex + dir;
      if (next < 0 || next >= pages.length) return;
      onIndexChange(next);
      // new page starts at its top (or bottom when flipping backwards)
      requestAnimationFrame(() => {
        const el = hostRef.current;
        if (el) el.scrollTop = dir === 1 ? 0 : el.scrollHeight;
      });
    },
    [clampedIndex, pages.length, onIndexChange]
  );

  // Wheel: scroll within an overflowing page; flip when already at the edge.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const el = hostRef.current;
      if (!el) return;
      const atTop = el.scrollTop <= 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const dir = e.deltaY > 0 ? 1 : -1;
      if ((dir === 1 && !atBottom) || (dir === -1 && !atTop)) {
        wheelAccum.current = 0;
        return; // native scroll handles it
      }
      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) >= 60) {
        wheelAccum.current = 0;
        flip(dir);
      }
    },
    [flip]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      )
        return;
      // Never flip the page underneath an open dialog or menu.
      if (
        document.querySelector(
          "[data-manage-dialog], [data-add-page-dialog], [data-page-context-menu]"
        )
      )
        return;
      if (e.key === "PageDown" || e.key === "ArrowRight") {
        e.preventDefault();
        flip(1);
      } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        flip(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  if (!page) return null;
  const pw = pageWidthFor(settings, box.w - 16, box.h - 8, ASPECT);

  return (
    <div className="relative h-full w-full" data-single-feed>
      <div
        ref={(el) => {
          hostRef.current = el;
          scrollerRef?.(el);
        }}
        className="h-full w-full overflow-auto"
        style={{ touchAction: "pan-x pan-y" }}
        onWheel={onWheel}
      >
        {/* shrink-0 + auto margins (NOT justify-center): a zoomed page must be
            allowed to exceed the viewport and pan from its left edge — flex
            shrink was silently re-fitting it (invisible zoom in portrait). */}
        <div className="flex min-h-full items-start p-2 pr-12">
          <div
            className="mx-auto shrink-0"
            data-page-index={page.index}
            data-page-label={page.label}
            style={{ width: pw }}
          >
            {renderPage(page)}
          </div>
        </div>
      </div>

      {/* page-flip arrows + position */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <button
          data-flip="prev"
          disabled={clampedIndex === 0}
          onClick={() => flip(-1)}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/80 text-lg font-bold text-white shadow disabled:opacity-30"
          title="Previous page (PageUp)"
        >
          ‹
        </button>
        <span className="pointer-events-auto rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-white shadow">
          {clampedIndex + 1} / {pages.length}
        </span>
        <button
          data-flip="next"
          disabled={clampedIndex === pages.length - 1}
          onClick={() => flip(1)}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/80 text-lg font-bold text-white shadow disabled:opacity-30"
          title="Next page (PageDown)"
        >
          ›
        </button>
      </div>
    </div>
  );
}
