/** Tool palette rebuilt from Jo's Drawboard toolbar (docs/reference/toolbar.png). */

export type ToolId =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rect"
  | "image";

/** Pen colors + widths as labeled on the Drawboard toolbar (1 / 1.5 pt). */
export const PEN_COLORS: { color: string; width: number; name: string }[] = [
  { color: "#29abe2", width: 1, name: "blue" },
  { color: "#8348c9", width: 1, name: "purple" },
  { color: "#5a9e32", width: 1, name: "green" },
  { color: "#d92b2b", width: 1, name: "red" },
  { color: "#f7931e", width: 1.5, name: "orange" },
  { color: "#ec4899", width: 1.5, name: "pink" },
  { color: "#1a1a1a", width: 1.5, name: "black" },
];

/** pt → logical page units (page is 1000 units wide ≈ an 8.5" sheet ≈ 612pt). */
export const PT_TO_UNITS = 1000 / 612;

export const HIGHLIGHTER_WIDTH_PT = 8;
export const HIGHLIGHTER_OPACITY = 0.4;
export const ERASER_RADIUS_PT = 4.5;
export const RECT_WIDTH_PT = 3;
export const TEXT_SIZE_PT = 8;
