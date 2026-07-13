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
 * changes; the in-progress stroke draws imperatively per pointer frame —
 * React never re-renders during a stroke.
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
        color: tool === "highlighter" ? penColor : penColor,
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
      renderStrokes(canvas, strokesRef.current, (rect.width / PAGE_W) * dpr);
      if (points.length > 0) {
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform((rect.width / PAGE_W) * dpr, 0, 0, (rect.width / PAGE_W) * dpr, 0, 0);
        drawStroke(ctx, activeStroke());
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

    const onDown = (e: PointerEvent) => {
      const { tool } = uiRef.current;
      if (tool === "select" || tool === "text" || tool === "image") return;
      if (e.pointerType === "touch") return; // touch scrolls, never draws
      drawing = true;
      pointerId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already-released pointer — capture is best-effort
      }
      uiRef.current.setPenActive(true);
      e.preventDefault();
      points = [];
      erased = new Map();
      const p = toLogical(e);
      if (tool === "eraser") eraseAt(p[0], p[1]);
      else {
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
        else if (tool === "rect") points = points.length === 0 ? [p] : [points[0], p];
        else points.push(p);
      }
      if (tool !== "eraser") repaintLive();
    };

    const finish = async () => {
      if (!drawing) return;
      drawing = false;
      uiRef.current.setPenActive(false);
      const { tool } = uiRef.current;
      if (tool === "eraser") {
        const dead = [...erased.values()];
        erased = new Map();
        if (dead.length > 0) await deleteStrokes(dead);
      } else if (points.length > 1) {
        const stroke: Stroke = { ...activeStroke(), id: crypto.randomUUID() };
        points = [];
        await addStroke(stroke);
      } else {
        points = [];
        repaintLive();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", finish);
    };
  }, [pageId]);

  const inkActive = !["select", "text", "image"].includes(ui.tool);
  return (
    <canvas
      ref={canvasRef}
      data-ink-canvas={pageId}
      className="absolute inset-0 h-full w-full"
      style={{
        // pan only — pinch is handled by the app-level zoom (keeps chrome visible)
        touchAction: "pan-x pan-y",
        pointerEvents: inkActive ? "auto" : "none",
        cursor: ui.tool === "eraser" ? "cell" : inkActive ? "crosshair" : "default",
      }}
    />
  );
}
