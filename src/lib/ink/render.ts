import { getStroke } from "perfect-freehand";
import type { Stroke } from "@/lib/db/types";
import { PT_TO_UNITS } from "./tools";

/** Path2D cache — outlines are recomputed only for new strokes. */
const pathCache = new Map<string, Path2D>();

export function clearPathCache(ids?: string[]) {
  if (!ids) pathCache.clear();
  else for (const id of ids) pathCache.delete(id);
}

function freehandOptions(stroke: Pick<Stroke, "tool" | "width">, forPen: boolean) {
  return {
    size: stroke.width * PT_TO_UNITS * (stroke.tool === "highlighter" ? 1 : 2.2),
    thinning: stroke.tool === "highlighter" ? 0 : 0.55,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: !forPen,
    last: true,
  };
}

/** Outline polygon path (in logical page units) for a pen/highlighter stroke. */
export function strokePath(stroke: Stroke): Path2D {
  const cacheable = !stroke.id.startsWith("__live__");
  let path = cacheable ? pathCache.get(stroke.id) : undefined;
  if (path) return path;
  const hasRealPressure = stroke.points.some((p) => p[2] !== 0.5);
  const outline = getStroke(
    stroke.points.map(([x, y, p]) => [x, y, p]),
    freehandOptions(stroke, hasRealPressure)
  );
  path = new Path2D();
  if (outline.length > 0) {
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
    path.closePath();
  }
  if (cacheable) pathCache.set(stroke.id, path);
  return path;
}

/** Draw one stroke onto a ctx already scaled to logical units. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  if (stroke.tool === "rect") {
    const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * PT_TO_UNITS;
    ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  } else {
    if (stroke.tool === "highlighter") ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = stroke.color;
    ctx.fill(strokePath(stroke));
  }
  ctx.restore();
}

/** Redraw a full page's strokes. `scale` = canvasPx / logical unit. */
export function renderStrokes(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  scale: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, canvas.width / scale, canvas.height / scale);
  for (const s of strokes) drawStroke(ctx, s);
}

/** Ids of strokes any of whose points fall within `radius` of (x, y). */
export function strokesHitByEraser(
  strokes: Stroke[],
  x: number,
  y: number,
  radius: number
): string[] {
  const r2 = radius * radius;
  const hits: string[] = [];
  for (const s of strokes) {
    if (s.tool === "rect") {
      const [a, b] = [s.points[0], s.points[s.points.length - 1]];
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      const onEdge =
        x >= x0 - radius && x <= x1 + radius && y >= y0 - radius && y <= y1 + radius &&
        !(x > x0 + radius && x < x1 - radius && y > y0 + radius && y < y1 - radius);
      if (onEdge) hits.push(s.id);
      continue;
    }
    for (const [px, py] of s.points) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy <= r2) {
        hits.push(s.id);
        break;
      }
    }
  }
  return hits;
}
