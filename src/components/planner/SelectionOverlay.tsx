"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import {
  copySelectionToClipboard,
  deleteSelectionContents,
  duplicateSelectionContents,
  moveSelectionContents,
} from "@/lib/blocks/actions";
import { computeAreaSelection } from "@/lib/ink/select";
import { usePlannerUI } from "./ui-context";

/** 8 resize handles: which box edges each one drags. */
const HANDLES: { key: string; l?: boolean; r?: boolean; t?: boolean; b?: boolean; pos: string; cursor: string }[] = [
  { key: "nw", l: true, t: true, pos: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { key: "n", t: true, pos: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "ne", r: true, t: true, pos: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { key: "e", r: true, pos: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { key: "se", r: true, b: true, pos: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { key: "s", b: true, pos: "left-1/2 -bottom-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "sw", l: true, b: true, pos: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { key: "w", l: true, pos: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

/**
 * The dashed box shown after a ⬚ area selection: drag it to move everything
 * inside (ink + blocks together), or use the action bar. All edits are one
 * undo step each.
 */
export default function SelectionOverlay() {
  const ui = usePlannerUI();
  const hostRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const resizing = useRef<{
    l: boolean; r: boolean; t: boolean; b: boolean;
    startX: number; startY: number;
    base: { x: number; y: number; w: number; h: number };
  } | null>(null);

  /** Resize the selection box → re-capture what's inside the new area. */
  const commitResize = async (dxPx: number, dyPx: number) => {
    const rz = resizing.current;
    const sel = ui.selection;
    if (!rz || !sel) return;
    const dx = dxPx / scale;
    const dy = dyPx / scale;
    let { x, y, w, h } = rz.base;
    if (rz.l) { x += dx; w -= dx; }
    if (rz.r) { w += dx; }
    if (rz.t) { y += dy; h -= dy; }
    if (rz.b) { h += dy; }
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    x = Math.max(0, Math.min(PAGE_W - 12, x));
    y = Math.max(0, Math.min(PAGE_H - 12, y));
    w = Math.max(12, Math.min(PAGE_W - x, w));
    h = Math.max(12, Math.min(PAGE_H - y, h));
    const next = await computeAreaSelection(sel.pageId, { x, y, w, h });
    ui.setSelection(next); // keep the box even if it now holds 0 items
  };

  const liveResizeStyle = (el: HTMLElement, dxPx: number, dyPx: number) => {
    const rz = resizing.current;
    if (!rz) return;
    const b = rz.base;
    const px = (u: number) => u * scale;
    const nx = px(b.x) + (rz.l ? dxPx : 0);
    const ny = px(b.y) + (rz.t ? dyPx : 0);
    const nw = px(b.w) + (rz.r ? dxPx : 0) - (rz.l ? dxPx : 0);
    const nh = px(b.h) + (rz.b ? dyPx : 0) - (rz.t ? dyPx : 0);
    el.style.left = `${Math.min(nx, nx + nw)}px`;
    el.style.top = `${Math.min(ny, ny + nh)}px`;
    el.style.width = `${Math.abs(nw)}px`;
    el.style.height = `${Math.abs(nh)}px`;
  };

  /** Paint the selection's actual content (ink crop + block sketches) into
   *  the ghost canvas so Jo sees exactly what she's placing while dragging. */
  const buildGhost = () => {
    const ghost = ghostRef.current;
    const sel = ui.selection;
    const host = hostRef.current;
    if (!ghost || !sel || !host) return;
    const stack = host.parentElement;
    const ink = stack?.querySelector<HTMLCanvasElement>("canvas[data-ink-canvas]");
    const gw = Math.max(1, Math.round(sel.rect.w * (pageWidth / PAGE_W)));
    const gh = Math.max(1, Math.round(sel.rect.h * (pageWidth / PAGE_W)));
    ghost.width = gw;
    ghost.height = gh;
    const ctx = ghost.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, gw, gh);
    if (ink && ink.width > 0) {
      const srcScale = ink.width / PAGE_W; // device px per logical unit
      ctx.drawImage(
        ink,
        sel.rect.x * srcScale, sel.rect.y * srcScale,
        sel.rect.w * srcScale, sel.rect.h * srcScale,
        0, 0, gw, gh
      );
    }
    // blocks: sketch position + first line of text
    for (const id of sel.blockIds) {
      const el = stack?.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
      if (!el) continue;
      const er = el.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const sx = pageWidth / PAGE_W;
      const bx = er.left - hr.left - sel.rect.x * sx;
      const by = er.top - hr.top - sel.rect.y * sx;
      ctx.fillStyle = "rgba(148,163,184,0.25)";
      ctx.fillRect(bx, by, er.width, er.height);
      ctx.fillStyle = "#334155";
      ctx.font = `${Math.max(9, 11 * sx * 2)}px sans-serif`;
      ctx.fillText((el.innerText || "").split("\n")[0].slice(0, 40), bx + 3, by + 12);
    }
  };
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
          buildGhost();
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
          const el = e.currentTarget as HTMLElement;
          el.style.transform = `translate(${e.clientX - d.startX}px, ${e.clientY - d.startY}px)`;
          if (ghostRef.current) ghostRef.current.style.opacity = "0.75";
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          (e.currentTarget as HTMLElement).style.transform = "";
          if (ghostRef.current) ghostRef.current.style.opacity = "0";
          if (d?.moved) void commitMove(e.clientX - d.startX, e.clientY - d.startY);
        }}
      >
        {/* ghost preview of the actual contents — visible while dragging */}
        <canvas
          ref={ghostRef}
          data-selection-ghost
          className="pointer-events-none absolute inset-0 h-full w-full transition-opacity"
          style={{ opacity: 0 }}
        />
        {/* corner + side handles: resize the box, re-capturing its contents */}
        {HANDLES.map((hd) => (
          <div
            key={hd.key}
            data-resize-selection={hd.key}
            className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-white bg-blue-600 ${hd.pos}`}
            style={{ cursor: hd.cursor, touchAction: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              resizing.current = {
                l: !!hd.l, r: !!hd.r, t: !!hd.t, b: !!hd.b,
                startX: e.clientX, startY: e.clientY,
                base: { ...sel.rect },
              };
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                // best-effort capture
              }
            }}
            onPointerMove={(e) => {
              if (!resizing.current) return;
              const box = (e.currentTarget as HTMLElement).closest("[data-selection-box]") as HTMLElement;
              liveResizeStyle(box, e.clientX - resizing.current.startX, e.clientY - resizing.current.startY);
            }}
            onPointerUp={(e) => {
              if (!resizing.current) return;
              const dx = e.clientX - resizing.current.startX;
              const dy = e.clientY - resizing.current.startY;
              void commitResize(dx, dy).finally(() => {
                resizing.current = null;
              });
            }}
          />
        ))}
        <div
          className="absolute -top-9 left-0 flex gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {sel.strokeIds.length + sel.blockIds.length} selected
          </span>
          <button
            data-selection-action="copy"
            className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            title="Copy — then right-click any page and Paste selection"
            onClick={() => void copySelectionToClipboard(ui.selection!, false)}
          >
            Copy
          </button>
          <button
            data-selection-action="cut"
            className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            title="Cut — then right-click any page and Paste selection"
            onClick={() => {
              void copySelectionToClipboard(ui.selection!, true);
              ui.setSelection(null);
            }}
          >
            ✂ Cut
          </button>
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
