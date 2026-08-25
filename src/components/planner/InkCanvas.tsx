"use client";

import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Stroke } from "@/lib/db/types";
import { PAGE_W } from "@/lib/planner/constants";
import {
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_WIDTH_PT,
  PT_TO_UNITS,
} from "@/lib/ink/tools";
import { drawStroke, renderStrokes, strokesHitByEraser } from "@/lib/ink/render";
import {
  computeAreaSelection,
  computeAreaSelectionPolygon,
  shapeAtPoint,
  shapeRect,
} from "@/lib/ink/select";
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
    let downTime = 0;
    let marquee: { start: [number, number]; end: [number, number] } | null = null;
    let lasso: [number, number][] | null = null;

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
        tool:
          tool === "highlighter" ? "highlighter"
          : tool === "rect" ? "rect"
          : tool === "circle" ? "circle"
          : "pen",
        color: penColor,
        // Shapes follow the active pen's width too (Jo: adjustable box lines).
        width: tool === "highlighter" ? HIGHLIGHTER_WIDTH_PT : penWidth,
        opacity: tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1,
        points,
        createdAt: Date.now(),
      };
    };

    /** Topmost block under a point — shared by every tap-select fallback. */
    const topBlockAt = async (x: number, y: number) => {
      const blocks = await db.blocks.where("pageId").equals(pageId).toArray();
      return blocks
        .filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
        .sort((a, b) => b.z - a.z)[0];
    };

    /** Marquee/lasso share one dashed-blue style; only the shape differs. */
    const paintDashed = (ctx: CanvasRenderingContext2D, draw: () => void) => {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "rgba(59,130,246,0.08)";
      draw();
      ctx.restore();
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
        const [x, y, w, h] = [
          Math.min(a[0], b[0]), Math.min(a[1], b[1]),
          Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]),
        ];
        paintDashed(ctx, () => {
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        });
      }
      if (lasso && lasso.length > 1) {
        const path = lasso;
        paintDashed(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(path[0][0], path[0][1]);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      }
    };

    const eraseAt = (x: number, y: number) => {
      // radius is live UI state now (Jo r11: adjustable eraser)
      const hits = strokesHitByEraser(
        strokesRef.current, x, y, uiRef.current.eraserRadius * PT_TO_UNITS * 2
      );
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

      // Touch never draws (except finger-selection): the feed-level gesture
      // handler owns panning, book-swipes, and pinch zoom.
      if (e.pointerType === "touch" && tool !== "marquee" && tool !== "lasso") return;

      // pen / mouse (or any pointer in marquee mode) = ink or marquee
      drawing = true;
      pointerId = e.pointerId;
      downTime = performance.now();
      capture(e.pointerId);
      uiRef.current.setPenActive(true);
      e.preventDefault();
      points = [];
      erased = new Map();
      marquee = null;
      lasso = null;
      const p = toLogical(e);
      if (tool === "eraser") {
        eraseAt(p[0], p[1]);
      } else if (tool === "marquee") {
        marquee = { start: [p[0], p[1]], end: [p[0], p[1]] };
        uiRef.current.setSelection(null);
        repaintLive();
      } else if (tool === "lasso") {
        lasso = [[p[0], p[1]]];
        uiRef.current.setSelection(null);
        repaintLive();
      } else {
        points.push(p);
        repaintLive();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing || e.pointerId !== pointerId) return;
      const { tool } = uiRef.current;
      const coalesced = "getCoalescedEvents" in e ? e.getCoalescedEvents() : [];
      const events = coalesced.length > 0 ? coalesced : [e];
      for (const ev of events) {
        const p = toLogical(ev as PointerEvent);
        if (tool === "eraser") eraseAt(p[0], p[1]);
        else if (tool === "marquee") {
          if (marquee) marquee.end = [p[0], p[1]];
        } else if (tool === "lasso") {
          if (lasso) lasso.push([p[0], p[1]]);
        } else if (tool === "rect" || tool === "circle") {
          points = points.length === 0 ? [p] : [points[0], p];
        } else points.push(p);
      }
      if (tool !== "eraser") repaintLive();
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
      if (rect.w < 8 || rect.h < 8) {
        // A TAP with the selection tool picks the item under it (Jo).
        const hit = await topBlockAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
        uiRef.current.setSelectedBlockId(hit ? hit.id : null);
        return;
      }
      // Line-aware: whole letters/lines, without grabbing neighbors whose
      // tails merely dip into the box (see strokesInRect).
      const sel = await computeAreaSelection(pageId, rect, strokesRef.current);
      applySelection(sel);
    };

    /** A box around exactly ONE item (no ink) becomes a normal item
     *  selection — full text menu, same as tapping it (Jo). */
    const applySelection = (sel: Awaited<ReturnType<typeof computeAreaSelection>>) => {
      if (sel.blockIds.length === 1 && sel.strokeIds.length === 0) {
        uiRef.current.setSelection(null);
        uiRef.current.setSelectedBlockId(sel.blockIds[0]);
        return;
      }
      uiRef.current.setSelection(sel.strokeIds.length > 0 || sel.blockIds.length > 0 ? sel : null);
    };

    const finishLasso = async () => {
      if (!lasso) return;
      const poly = lasso;
      lasso = null;
      repaintLive();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      if (poly.length < 3 || rect.w < 8 || rect.h < 8) {
        // A TAP with the lasso picks the item under it, same as the marquee.
        const hit = await topBlockAt(poly[0][0], poly[0][1]);
        uiRef.current.setSelectedBlockId(hit ? hit.id : null);
        return;
      }
      // The selection carries the lasso's bounding box, so the overlay,
      // move, scale and clipboard machinery all work unchanged.
      const sel = await computeAreaSelectionPolygon(pageId, poly, rect, strokesRef.current);
      applySelection(sel);
    };

    const finish = async (e: PointerEvent) => {
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
      } else if (tool === "lasso") {
        await finishLasso();
      } else if (points.length > 0) {
        // A quick TAP on a block selects it to move (Jo: "click any item"),
        // instead of leaving a dot of ink on top of it. A crisp stylus tap
        // can report a single point and no move at all, so taps are handled
        // before the "is this a stroke?" test below (Jo r13).
        const isTap =
          performance.now() - downTime < 350 &&
          points.length <= 5 &&
          Math.hypot(
            points[points.length - 1][0] - points[0][0],
            points[points.length - 1][1] - points[0][1]
          ) < 8;
        // A tap with the shape tool picks up an existing shape to resize,
        // instead of stamping a zero-size one (Jo r13).
        if (isTap && (tool === "rect" || tool === "circle")) {
          const hit = shapeAtPoint(strokesRef.current, points[0][0], points[0][1]);
          points = [];
          repaintLive();
          if (hit) {
            uiRef.current.setSelectedBlockId(null);
            uiRef.current.setSelection({
              pageId,
              rect: shapeRect(hit),
              strokeIds: [hit.id],
              blockIds: [],
            });
          }
          return;
        }
        if (isTap && (tool === "pen" || tool === "highlighter")) {
          const hit = await topBlockAt(points[0][0], points[0][1]);
          if (hit) {
            points = [];
            repaintLive();
            uiRef.current.setSelectedBlockId(hit.id);
            return;
          }
        }
        // One lone point is not a stroke: for a shape tool it would stamp a
        // zero-size box, and pen/highlighter never drew a dot from it either.
        if (points.length < 2) {
          points = [];
          repaintLive();
          return;
        }
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
      lasso = null;
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
        cursor:
          ui.tool === "eraser"
            ? "cell"
            : ui.tool === "pen" || ui.tool === "highlighter"
              ? DOT_CURSOR
              : inkActive
                ? "crosshair"
                : "default",
      }}
    />
  );
}

/** A small dot instead of the big crosshair (Jo) — 8px circle, centered hotspot. */
const DOT_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Ccircle cx='4' cy='4' r='3' fill='%23334155' stroke='white' stroke-width='1'/%3E%3C/svg%3E") 4 4, crosshair`;
