import type { Stroke } from "@/lib/db/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  const inRect = (x: number, y: number) =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  const ids: string[] = [];
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    let inside = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of s.points) {
      if (inRect(x, y)) inside++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const majority = inside / s.points.length >= 0.5;
    const centerIn = inRect((minX + maxX) / 2, (minY + maxY) / 2);
    if (majority || centerIn) ids.push(s.id);
  }
  return ids;
}
