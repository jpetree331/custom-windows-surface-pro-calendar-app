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
