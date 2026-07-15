"use client";

import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Stroke } from "@/lib/db/types";
import { PAGE_W } from "@/lib/planner/constants";
import {
  ERASER_RADIUS_PT,
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_WIDTH_PT,
  PT_TO_UNITS,
  RECT_WIDTH_PT,
} from "@/lib/ink/tools";
import { drawStroke, renderStrokes, strokesHitByEraser } from "@/lib/ink/render";
import { addStroke, deleteStrokes } from "@/lib/blocks/actions";
import { usePlannerUI } from "./ui-context";

/**
 * Per-page ink surface. Committed strokes redraw only when the stroke set
 * changes; the in-progress stroke draws imperatively per pointer frame.
 *
 * Gesture ownership: the canvas is `touch-action: none` — the browser never
 * pans/zooms from it. On Windows a pen drag counts as pannable "direct
 * manipulation", so any allowed pan axis made Edge fight the ink handler:
 * strokes were cancelled mid-word (gaps) and the page got "grabbed". Instead:
 *  - pen/mouse = ink (uninterruptible; pointercancel DISCARDS, never commits)
 *  - one finger = manual pan via ui.panBy, ending in a book-style swipe flip
 *  - two fingers = app-level pinch zoom (feed listener)
 */
export default function InkCanvas({ pageId }: { pageId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ui = usePlannerUI();
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const strokes = useLiveQuery(
    () => db.strokes.where("pageId").equals(pageId).toArray(),
    [pageId]
  );
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes ?? [];

  // Redraw committed strokes when they change or the page resizes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes) return;
    const redraw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      renderStrokes(canvas, strokes, (rect.width / PAGE_W) * dpr);
    };
    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [strokes]);

  // Pointer handling — attached once, reads live state via refs.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let drawing = false;
    let points: [number, number, number][] = [];
    let erased = new Map<string, Stroke>();
    let pointerId = -1;
    let marquee: { start: [number, number]; end: [number, number] } | null = null;

    // one-finger manual pan / swipe state
    let panId = -1;
    let touchCount = 0;
    let panLast = { x: 0, y: 0 };
    let panTotal = { x: 0, y: 0 };
    let panStartT = 0;

    const toLogical = (e: PointerEvent): [number, number, number] => {
      const rect = canvas.getBoundingClientRect();
      const scale = PAGE_W / rect.width;
      return [
        (e.clientX - rect.left) * scale,
        (e.clientY - rect.top) * scale,
        e.pointerType === "pen" ? e.pressure || 0.5 : 0.5,
      ];
    };

    const activeStroke = (): Stroke => {
      const { tool, penColor, penWidth } = uiRef.current;
      return {
        id: "__live__",
        pageId,
        tool: tool === "highlighter" ? "highlighter" : tool === "rect" ? "rect" : "pen",
        color: penColor,
        width:
          tool === "highlighter" ? HIGHLIGHTER_WIDTH_PT : tool === "rect" ? RECT_WIDTH_PT : penWidth,
        opacity: tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1,
        points,
        createdAt: Date.now(),
      };
    };

    const repaintLive = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const s = (rect.width / PAGE_W) * dpr;
      renderStrokes(canvas, strokesRef.current, s);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      if (points.length > 0) drawStroke(ctx, activeStroke());
      if (marquee) {
        const [a, b] = [marquee.start, marquee.end];
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#2563eb";
        ctx.fillStyle = "rgba(59,130,246,0.08)";
        const [x, y, w, h] = [
          Math.min(a[0], b[0]), Math.min(a[1], b[1]),
          Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]),
        ];
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
    };

    const eraseAt = (x: number, y: number) => {
      const hits = strokesHitByEraser(strokesRef.current, x, y, ERASER_RADIUS_PT * PT_TO_UNITS * 2);
      if (hits.length === 0) return;
      for (const id of hits) {
        const s = strokesRef.current.find((st) => st.id === id);
        if (s && !erased.has(id)) erased.set(id, s);
      }
      // Optimistic local hide; committed as one undo entry on pointerup.
      strokesRef.current = strokesRef.current.filter((s) => !erased.has(s.id));
      repaintLive();
    };

    const capture = (id: number) => {
      try {
        canvas.setPointerCapture(id);
      } catch {
        // synthetic or already-released pointer — capture is best-effort
      }
    };

    const onDown = (e: PointerEvent) => {
      const { tool } = uiRef.current;
      if (tool === "select" || tool === "text" || tool === "image") return;

      if (e.pointerType === "touch" && tool !== "marquee") {
        // One finger pans; a second finger hands over to the pinch zoom.
        touchCount++;
        if (drawing) return; // palm while writing — ignore entirely
        if (touchCount === 1) {
          panId = e.pointerId;
          panLast = { x: e.clientX, y: e.clientY };
          panTotal = { x: 0, y: 0 };
          panStartT = performance.now();
          capture(e.pointerId);
        } else {
          panId = -1; // pinch takes over
        }
        return;
      }

      // pen / mouse (or any pointer in marquee mode) = ink or marquee
      drawing = true;
      pointerId = e.pointerId;
      capture(e.pointerId);
      uiRef.current.setPenActive(true);
      e.preventDefault();
      points = [];
      erased = new Map();
      marquee = null;
      const p = toLogical(e);
      if (tool === "eraser") {
        eraseAt(p[0], p[1]);
      } else if (tool === "marquee") {
        marquee = { start: [p[0], p[1]], end: [p[0], p[1]] };
        uiRef.current.setSelection(null);
        repaintLive();
      } else {
        points.push(p);
        repaintLive();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId === panId) {
        const dx = e.clientX - panLast.x;
        const dy = e.clientY - panLast.y;
        panLast = { x: e.clientX, y: e.clientY };
        panTotal = { x: panTotal.x + dx, y: panTotal.y + dy };
        uiRef.current.panBy(dx, dy);
        return;
      }
      if (!drawing || e.pointerId !== pointerId) return;
      const { tool } = uiRef.current;
      const coalesced = "getCoalescedEvents" in e ? e.getCoalescedEvents() : [];
      const events = coalesced.length > 0 ? coalesced : [e];
      for (const ev of events) {
        const p = toLogical(ev as PointerEvent);
        if (tool === "eraser") eraseAt(p[0], p[1]);
        else if (tool === "marquee") {
          if (marquee) marquee.end = [p[0], p[1]];
        } else if (tool === "rect") points = points.length === 0 ? [p] : [points[0], p];
        else points.push(p);
      }
      if (tool !== "eraser") repaintLive();
    };

    const endTouch = (e: PointerEvent) => {
      touchCount = Math.max(0, touchCount - 1);
      if (e.pointerId !== panId) return;
      panId = -1;
      // Book-style swipe: fast, mostly-horizontal drag flips the page.
      const dt = performance.now() - panStartT;
      if (dt < 600 && Math.abs(panTotal.x) > 60 && Math.abs(panTotal.x) > 1.5 * Math.abs(panTotal.y)) {
        uiRef.current.flipPage(panTotal.x < 0 ? 1 : -1);
      }
    };

    const finishMarquee = async () => {
      if (!marquee) return;
      const [a, b] = [marquee.start, marquee.end];
      const rect = {
        x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]),
        w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]),
      };
      marquee = null;
      repaintLive();
      if (rect.w < 8 || rect.h < 8) return; // a tap, not a box
      const inRect = (x: number, y: number) =>
        x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
      const strokeIds = strokesRef.current
        .filter((s) => s.points.some(([x, y]) => inRect(x, y)))
        .map((s) => s.id);
      const blocks = await db.blocks.where("pageId").equals(pageId).toArray();
      const blockIds = blocks
        .filter((bl) => bl.x < rect.x + rect.w && bl.x + bl.w > rect.x && bl.y < rect.y + rect.h && bl.y + bl.h > rect.y)
        .map((bl) => bl.id);
      uiRef.current.setSelection(
        strokeIds.length > 0 || blockIds.length > 0 ? { pageId, rect, strokeIds, blockIds } : null
      );
    };

    const finish = async (e: PointerEvent) => {
      if (e.pointerType === "touch" && e.pointerId !== pointerId) {
        endTouch(e);
        return;
      }
      if (!drawing || e.pointerId !== pointerId) return;
      drawing = false;
      uiRef.current.setPenActive(false);
      const { tool } = uiRef.current;
      if (tool === "eraser") {
        const dead = [...erased.values()];
        erased = new Map();
        if (dead.length > 0) await deleteStrokes(dead);
      } else if (tool === "marquee") {
        await finishMarquee();
      } else if (points.length > 1) {
        const stroke: Stroke = { ...activeStroke(), id: crypto.randomUUID() };
        points = [];
        await addStroke(stroke);
      } else {
        points = [];
        repaintLive();
      }
    };

    // pointercancel must DISCARD, never commit — a cancelled pen stroke saved
    // as a fragment is exactly the "gappy writing" failure mode.
    const abort = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touchCount = Math.max(0, touchCount - 1);
        if (e.pointerId === panId) panId = -1;
        return;
      }
      if (!drawing || e.pointerId !== pointerId) return;
      drawing = false;
      uiRef.current.setPenActive(false);
      // restore optimistically-hidden erased strokes
      if (erased.size > 0) {
        strokesRef.current = [...strokesRef.current, ...erased.values()];
        erased = new Map();
      }
      points = [];
      marquee = null;
      repaintLive();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", abort);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", abort);
    };
  }, [pageId]);

  const inkActive = !["select", "text", "image"].includes(ui.tool);
  return (
    <canvas
      ref={canvasRef}
      data-ink-canvas={pageId}
      className="absolute inset-0 h-full w-full"
      style={{
        // NONE: the browser must never pan/zoom from the ink surface — pen
        // drags count as pan gestures on Windows and were breaking strokes.
        // Touch panning/swiping is reimplemented manually above.
        touchAction: "none",
        pointerEvents: inkActive ? "auto" : "none",
        cursor: ui.tool === "eraser" ? "cell" : inkActive ? "crosshair" : "default",
      }}
    />
  );
}
