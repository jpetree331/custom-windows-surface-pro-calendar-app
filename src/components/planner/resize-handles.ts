/** 8 resize handles (corners + sides) shared by the ⬚ selection box and
 *  selected blocks: which box edges each handle drags, where it sits. */
export interface ResizeHandle {
  key: string;
  l?: boolean;
  r?: boolean;
  t?: boolean;
  b?: boolean;
  pos: string;
  cursor: string;
}

export const RESIZE_HANDLES: ResizeHandle[] = [
  { key: "nw", l: true, t: true, pos: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { key: "n", t: true, pos: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "ne", r: true, t: true, pos: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { key: "e", r: true, pos: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { key: "se", r: true, b: true, pos: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { key: "s", b: true, pos: "left-1/2 -bottom-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "sw", l: true, b: true, pos: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { key: "w", l: true, pos: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

export function isCornerHandle(edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean }): boolean {
  return !!(edges.l || edges.r) && !!(edges.t || edges.b);
}

/**
 * Like resizeRect, but locks the base aspect ratio (corner handles keep the
 * scale — Jo). The dominant drag axis picks the scale factor so a diagonal
 * drag doesn't "pop" between interpretations.
 */
export function resizeRectAspectLocked(
  base: { x: number; y: number; w: number; h: number },
  edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean },
  dx: number,
  dy: number,
  minW = 12,
  minH = 12
): { x: number; y: number; w: number; h: number } {
  const raw = resizeRect(base, edges, dx, dy);
  const sx = raw.w / Math.max(1e-6, base.w);
  const sy = raw.h / Math.max(1e-6, base.h);
  let s = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
  s = Math.max(s, minW / Math.max(1e-6, base.w), minH / Math.max(1e-6, base.h));
  const w = base.w * s;
  const h = base.h * s;
  return {
    x: edges.l ? base.x + base.w - w : base.x,
    y: edges.t ? base.y + base.h - h : base.y,
    w,
    h,
  };
}

/** Apply a handle-drag delta to a rect (normalizing inversions). */
export function resizeRect(
  base: { x: number; y: number; w: number; h: number },
  edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean },
  dx: number,
  dy: number
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = base;
  if (edges.l) { x += dx; w -= dx; }
  if (edges.r) { w += dx; }
  if (edges.t) { y += dy; h -= dy; }
  if (edges.b) { h += dy; }
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}
