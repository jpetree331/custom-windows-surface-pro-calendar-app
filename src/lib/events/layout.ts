/** Pure math for chip drag-within-a-day (unit-tested; no DOM). */

export interface Box {
  w: number;
  h: number;
}

/**
 * Convert a drag delta into a clamped cell-relative position (% of cell).
 * `seed` is the chip's rendered position when the drag started, as %.
 * The chip must stay fully inside its day cell.
 */
export function clampChipOffset(
  cell: Box,
  chip: Box,
  seed: { x: number; y: number },
  dxPx: number,
  dyPx: number
): { x: number; y: number } {
  const maxX = Math.max(0, 100 - (chip.w / Math.max(1, cell.w)) * 100);
  const maxY = Math.max(0, 100 - (chip.h / Math.max(1, cell.h)) * 100);
  const x = seed.x + (dxPx / Math.max(1, cell.w)) * 100;
  const y = seed.y + (dyPx / Math.max(1, cell.h)) * 100;
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}
