/** Tool palette rebuilt from Jo's Drawboard toolbar (docs/reference/toolbar.png). */

export type ToolId =
  | "select"
  | "marquee"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rect"
  | "image";

/**
 * Pen palette = Jo's category color system (her exact hex codes). Each slot's
 * color/width can be customized in the toolbar; these are the defaults.
 */
export const PEN_COLORS: { color: string; width: number; name: string }[] = [
  { color: "#3DC9FD", width: 1, name: "Appointments" },
  { color: "#7400B3", width: 1, name: "To-Do List" },
  { color: "#78B13B", width: 1, name: "Cleaning Chores" },
  { color: "#D50404", width: 1, name: "Business Stuff" },
  { color: "#FF9B24", width: 1.5, name: "Birthdays" },
  { color: "#FF5CB9", width: 1.5, name: "Holidays" },
  { color: "#000000", width: 1.5, name: "Misc." },
];

/** pt → logical page units (page is 1000 units wide ≈ an 8.5" sheet ≈ 612pt). */
export const PT_TO_UNITS = 1000 / 612;

export const HIGHLIGHTER_WIDTH_PT = 8;
export const HIGHLIGHTER_OPACITY = 0.4;
export const ERASER_RADIUS_PT = 4.5;
export const RECT_WIDTH_PT = 3;
export const TEXT_SIZE_PT = 8;
