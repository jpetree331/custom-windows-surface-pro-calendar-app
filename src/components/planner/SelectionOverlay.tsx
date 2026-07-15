"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import {
  deleteSelectionContents,
  duplicateSelectionContents,
  moveSelectionContents,
} from "@/lib/blocks/actions";
import { usePlannerUI } from "./ui-context";

/**
 * The dashed box shown after a ⬚ area selection: drag it to move everything
 * inside (ink + blocks together), or use the action bar. All edits are one
 * undo step each.
 */
export default function SelectionOverlay() {
  const ui = usePlannerUI();
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPageWidth(el.clientWidth));
    ro.observe(el);
    setPageWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const sel = ui.selection;
  if (!sel || pageWidth === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" />;
  }

  const scale = pageWidth / PAGE_W;
  const px = (u: number) => u * scale;

  const commitMove = async (dxPx: number, dyPx: number) => {
    const dx = dxPx / scale;
    const dy = dyPx / scale;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    await moveSelectionContents(sel, dx, dy);
    ui.setSelection({
      ...sel,
      rect: {
        ...sel.rect,
        x: Math.max(0, Math.min(PAGE_W - sel.rect.w, sel.rect.x + dx)),
        y: Math.max(0, Math.min(PAGE_H - sel.rect.h, sel.rect.y + dy)),
      },
    });
  };

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0" data-selection-overlay>
      <div
        data-selection-box
        className="pointer-events-auto absolute cursor-move rounded-sm border-2 border-dashed border-blue-600 bg-blue-400/10"
        style={{
          left: px(sel.rect.x),
          top: px(sel.rect.y),
          width: px(sel.rect.w),
          height: px(sel.rect.h),
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          drag.current = { startX: e.clientX, startY: e.clientY, moved: false };
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // best-effort capture
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          d.moved = true;
          (e.currentTarget as HTMLElement).style.transform =
            `translate(${e.clientX - d.startX}px, ${e.clientY - d.startY}px)`;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          (e.currentTarget as HTMLElement).style.transform = "";
          if (d?.moved) void commitMove(e.clientX - d.startX, e.clientY - d.startY);
        }}
      >
        <div
          className="absolute -top-9 left-0 flex gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {sel.strokeIds.length + sel.blockIds.length} selected
          </span>
          <button
            data-selection-action="duplicate"
            className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            title="Duplicate everything in the box"
            onClick={() =>
              void duplicateSelectionContents(sel).then((clone) =>
                ui.setSelection({
                  ...clone,
                  rect: { ...sel.rect, x: sel.rect.x + 24, y: sel.rect.y + 24 },
                })
              )
            }
          >
            ⧉ Duplicate
          </button>
          <button
            data-selection-action="delete"
            className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            title="Delete everything in the box (Ctrl+Z restores)"
            onClick={() => {
              void deleteSelectionContents(sel);
              ui.setSelection(null);
            }}
          >
            ✕ Delete
          </button>
          <button
            data-selection-action="done"
            className="rounded bg-slate-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            onClick={() => ui.setSelection(null)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
