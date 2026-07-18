/** Shared record types — one shape for Dexie rows and Supabase rows. */

export type PageType = "year" | "month" | "week" | "section";
export type BlockType = "text" | "image" | "task";
export type InkTool = "pen" | "highlighter" | "rect";
export type HabitCadence = "daily" | "weekly";
export type EventKind = "event" | "birthday" | "reminder";

export interface Planner {
  id: string;
  year: number;
  title: string;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Page {
  id: string;
  plannerId: string;
  type: PageType;
  /** Global sort order in the continuous feed (0-based). */
  index: number;
  label: string;
  /** 0–11 for month/week pages; -1 otherwise. */
  monthIndex: number;
  /** ISO date (YYYY-MM-DD) of first day covered, or "" for section pages. */
  dateStart: string;
  /** ISO date of last day covered, or "". */
  dateEnd: string;
  meta: Record<string, unknown>;
  updatedAt: number;
}

/** A single ink stroke: vector points, cheap to store and redraw. */
export interface Stroke {
  id: string;
  pageId: string;
  tool: InkTool | "eraser";
  color: string;
  width: number;
  opacity: number;
  /** [x, y, pressure] triples in page-local coordinates (0..PAGE_W / 0..PAGE_H). */
  points: [number, number, number][];
  createdAt: number;
}

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Text content for text/task blocks. */
  content: string;
  /** Text color for text/task blocks (defaults to ink black). */
  color?: string;
  /** Text styling for text/task blocks (defaults: 8pt, regular). */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Image bytes for image blocks (stored as Blob in IndexedDB). */
  imageBlob?: Blob;
  /** Task blocks only. */
  checked?: boolean;
  categoryId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: string;
  plannerId: string;
  name: string;
  cadence: HabitCadence;
  order: number;
  active: boolean;
}

export interface HabitCheck {
  id: string;
  habitId: string;
  /** YYYY-MM-DD; for weekly habits, the Monday of the week. */
  date: string;
  checked: boolean;
}

export interface Category {
  id: string;
  plannerId: string;
  name: string;
  color: string;
  order: number;
}

export interface PlannerEvent {
  id: string;
  plannerId: string;
  googleId?: string;
  kind: EventKind;
  title: string;
  /** YYYY-MM-DD of the (first) occurrence. */
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  rrule?: string;
  categoryId?: string;
  updatedAt: number;
}

export interface SyncQueueItem {
  seq?: number;
  table: string;
  rowId: string;
  op: "put" | "delete";
  ts: number;
}
