"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RESIZE_HANDLES, resizeRect } from "../resize-handles";
import * as history from "@/lib/history";

export interface WinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function useViewportSize() {
  const [size, setSize] = useState({ w: 1024, h: 768 });
  useEffect(() => {
    const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return size;
}

const MIN_W = 0.15;
const MIN_H = 0.12;

/** Keep the title bar reachable no matter where a drag/resize ends. */
function clampRect(r: WinRect): WinRect {
  const w = Math.min(0.95, Math.max(MIN_W, r.w));
  const h = Math.min(0.95, Math.max(MIN_H, r.h));
  return {
    x: Math.min(0.97 - w * 0.3, Math.max(0.02 - w + 0.1, r.x)),
    y: Math.min(0.92, Math.max(0, r.y)),
    w,
    h,
  };
}

type Edges = { l?: boolean; r?: boolean; t?: boolean; b?: boolean };

/**
 * Unlike a selection box, a window must never INVERT when a handle is
 * dragged past the opposite edge, and the un-dragged edge must stay pinned
 * at the minimum size. Clamping the delta (not the result) guarantees both.
 */
function clampResizeDelta(base: WinRect, edges: Edges, dx: number, dy: number) {
  return {
    dx: edges.l ? Math.min(dx, base.w - MIN_W) : edges.r ? Math.max(dx, MIN_W - base.w) : 0,
    dy: edges.t ? Math.min(dy, base.h - MIN_H) : edges.b ? Math.max(dy, MIN_H - base.h) : 0,
  };
}

/**
 * Floating window chrome shared by the Notes List and every note: fixed
 * position in viewport FRACTIONS (survives browser resizes), drag by title
 * bar, 8-handle resize, click-to-front. Never nested in the feed, so the
 * planner's pan/pinch gestures structurally can't fire from here — the
 * data-notepad-window attr additionally opts out of the INTERACTIVE check.
 */
export default function FloatingWindow({
  rect,
  z,
  title,
  onCommitRect,
  onFocus,
  onClose,
  children,
  name,
}: {
  rect: WinRect;
  z: number;
  title: ReactNode;
  onCommitRect: (r: WinRect) => void;
  onFocus: () => void;
  onClose: () => void;
  children: ReactNode;
  name: string;
}) {
  const vp = useViewportSize();
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number } | null>(null);
  const resizing = useRef<{
    edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean };
    startX: number;
    startY: number;
    base: WinRect;
  } | null>(null);

  const toFrac = (dxPx: number, dyPx: number) => ({
    dx: dxPx / Math.max(1, vp.w),
    dy: dyPx / Math.max(1, vp.h),
  });

  const captureBestEffort = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointer
    }
  };

  return (
    <div
      ref={rootRef}
      data-notepad-window={name}
      className="fixed flex flex-col overflow-visible rounded-lg border border-slate-300 bg-white shadow-2xl print:hidden"
      style={{
        left: rect.x * vp.w,
        top: rect.y * vp.h,
        width: rect.w * vp.w,
        height: rect.h * vp.h,
        zIndex: 1000 + z,
        touchAction: "none",
      }}
      onPointerDownCapture={() => {
        // notes own their own Ctrl+Z scope; also raise this window
        history.setActivePlanner(history.NOTES_SCOPE);
        onFocus();
      }}
    >
      {/* title bar = drag handle */}
      <div
        data-notepad-titlebar
        className="flex shrink-0 cursor-move items-center gap-1 rounded-t-lg border-b border-slate-200 bg-slate-100 px-2 py-1"
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("input,button")) return; // typing/close, not dragging
          e.preventDefault();
          drag.current = { startX: e.clientX, startY: e.clientY };
          captureBestEffort(e);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const root = rootRef.current;
          if (!d || !root) return;
          root.style.transform = `translate(${e.clientX - d.startX}px, ${e.clientY - d.startY}px)`;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          const root = rootRef.current;
          if (root) root.style.transform = "";
          if (!d) return;
          const { dx, dy } = toFrac(e.clientX - d.startX, e.clientY - d.startY);
          if (dx === 0 && dy === 0) return;
          onCommitRect(clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }));
        }}
      >
        <div className="min-w-0 flex-1">{title}</div>
        <button
          data-notepad-close
          title="Close"
          onClick={onClose}
          className="shrink-0 rounded px-1.5 text-sm font-bold text-slate-500 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {RESIZE_HANDLES.map((hd) => (
        <div
          key={hd.key}
          data-notepad-resize={hd.key}
          className={`absolute h-3 w-3 rounded-sm border border-white bg-slate-500/80 ${hd.pos}`}
          style={{ cursor: hd.cursor, touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            resizing.current = {
              edges: { l: hd.l, r: hd.r, t: hd.t, b: hd.b },
              startX: e.clientX,
              startY: e.clientY,
              base: rect,
            };
            captureBestEffort(e);
          }}
          onPointerMove={(e) => {
            const rz = resizing.current;
            const root = rootRef.current;
            if (!rz || !root) return;
            const raw = toFrac(e.clientX - rz.startX, e.clientY - rz.startY);
            const { dx, dy } = clampResizeDelta(rz.base, rz.edges, raw.dx, raw.dy);
            const r = clampRect(resizeRect(rz.base, rz.edges, dx, dy));
            root.style.left = `${r.x * vp.w}px`;
            root.style.top = `${r.y * vp.h}px`;
            root.style.width = `${r.w * vp.w}px`;
            root.style.height = `${r.h * vp.h}px`;
          }}
          onPointerUp={(e) => {
            const rz = resizing.current;
            resizing.current = null;
            if (!rz) return;
            const raw = toFrac(e.clientX - rz.startX, e.clientY - rz.startY);
            // a tap on a handle isn't a resize — a no-op commit would still
            // bump updatedAt and reorder the Notes List
            if (raw.dx === 0 && raw.dy === 0) return;
            const { dx, dy } = clampResizeDelta(rz.base, rz.edges, raw.dx, raw.dy);
            onCommitRect(clampRect(resizeRect(rz.base, rz.edges, dx, dy)));
          }}
        />
      ))}
    </div>
  );
}
