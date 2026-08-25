import { db } from "@/lib/db/db";
import type { Stroke } from "@/lib/db/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AreaSelectionResult {
  pageId: string;
  rect: Rect;
  strokeIds: string[];
  blockIds: string[];
}

/**
 * What lives inside `rect` on this page — strokes via the line-aware
 * heuristic, blocks via bbox intersection. Shared by the marquee tool and
 * the selection-box resize handles.
 */
export async function computeAreaSelection(
  pageId: string,
  rect: Rect,
  strokes?: Stroke[]
): Promise<AreaSelectionResult> {
  const pageStrokes = strokes ?? (await db.strokes.where("pageId").equals(pageId).toArray());
  const strokeIds = strokesInRect(pageStrokes, rect);
  const blocks = await db.blocks.where("pageId").equals(pageId).toArray();
  const blockIds = blocks
    .filter((b) => b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y)
    .map((b) => b.id);
  return { pageId, rect, strokeIds, blockIds };
}

type Pt = [number, number];

/** Ray-casting point-in-polygon (even-odd rule). */
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/**
 * Shared line-aware membership heuristic (see strokesInRect's doc): a stroke
 * belongs when ≥ half its points are inside OR its bbox center is inside.
 * The marquee and lasso differ only in the inside-test.
 */
function strokesByHeuristic(strokes: Stroke[], isInside: (x: number, y: number) => boolean): string[] {
  const ids: string[] = [];
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    let inside = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of s.points) {
      if (isInside(x, y)) inside++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const majority = inside / s.points.length >= 0.5;
    const centerIn = isInside((minX + maxX) / 2, (minY + maxY) / 2);
    if (majority || centerIn) ids.push(s.id);
  }
  return ids;
}

/** Lasso membership — the rect heuristic against a freeform outline. */
export function strokesInPolygon(strokes: Stroke[], poly: Pt[]): string[] {
  return strokesByHeuristic(strokes, (x, y) => pointInPolygon([x, y], poly));
}

/**
 * Lasso capture: strokes via the polygon heuristic, blocks when their center
 * is enclosed (bbox overlap feels arbitrary against a freeform outline). The
 * result carries the lasso's BOUNDING BOX as its rect, so the existing
 * selection overlay, move, scale and clipboard machinery work unchanged.
 */
export async function computeAreaSelectionPolygon(
  pageId: string,
  polygon: Pt[],
  bboxRect: Rect,
  strokes?: Stroke[]
): Promise<AreaSelectionResult> {
  const pageStrokes = strokes ?? (await db.strokes.where("pageId").equals(pageId).toArray());
  const strokeIds = strokesInPolygon(pageStrokes, polygon);
  const blocks = await db.blocks.where("pageId").equals(pageId).toArray();
  const blockIds = blocks
    .filter((b) => pointInPolygon([b.x + b.w / 2, b.y + b.h / 2], polygon))
    .map((b) => b.id);
  return { pageId, rect: bboxRect, strokeIds, blockIds };
}

/**
 * Line-aware handwriting selection. "Any point inside" grabbed neighboring
 * lines whose descenders dipped into the box, and shrinking the box to avoid
 * them cut letters off the target line. A stroke is selected when the box
 * plausibly MEANS it:
 *  - at least half its points are inside, OR
 *  - the center of its bounding box is inside (big letter, small box).
 */
export function strokesInRect(strokes: Stroke[], rect: Rect): string[] {
  return strokesByHeuristic(
    strokes,
    (x, y) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

/** Bounding box of a 2-point shape stroke (rect/circle). */
export function shapeRect(stroke: Stroke): Rect {
  const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(b[0] - a[0]),
    h: Math.abs(b[1] - a[1]),
  };
}

/**
 * Topmost drawn rectangle/circle under a point (Jo r13: shapes must be
 * selectable and resizable). Newest wins, and a generous tolerance means she
 * can tap the outline rather than having to hit it exactly.
 */
export function shapeAtPoint(strokes: Stroke[], x: number, y: number, tol = 14): Stroke | undefined {
  return [...strokes]
    .filter((s) => (s.tool === "rect" || s.tool === "circle") && s.points.length >= 2)
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((s) => {
      const r = shapeRect(s);
      return (
        x >= r.x - tol && x <= r.x + r.w + tol && y >= r.y - tol && y <= r.y + r.h + tol
      );
    });
}
