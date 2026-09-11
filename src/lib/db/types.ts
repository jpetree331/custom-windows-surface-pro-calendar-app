/** Shared record types — one shape for Dexie rows and Supabase rows. */

export type PageType = "year" | "month" | "week" | "section";
export type BlockType = "text" | "image" | "task";
export type InkTool = "pen" | "highlighter" | "rect" | "circle";
export type HabitCadence = "daily" | "weekly";
/** "notice" = derived display row (Google reminder / birthday lead), wiped and
 *  regenerated on every import — never authored by the user directly. */
export type EventKind = "event" | "birthday" | "reminder" | "notice";

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
  /** Text alignment inside the box (Jo r13); default left. */
  align?: "left" | "center" | "right";
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
  /** Google event body (shown in the details popover). */
  description?: string;
  location?: string;
  /** Google reminder overrides ≥ 24h, in minutes (display-only). */
  reminderOverridesMin?: number[];
  /** Chip drag position, % of the day cell (undefined = normal flow). */
  offsetX?: number;
  offsetY?: number;
  /** Google calendar this row was imported from — lets "uncheck a calendar"
   *  actually remove its items instead of guessing from titles (Jo r12). */
  calendarId?: string;
  /** notice rows only: the event/birthday this was derived from. */
  sourceEventId?: string;
  /** notice rows only: the parent event's date, so a reminder can disappear
   *  once the event itself has passed without re-querying the parent. */
  parentDate?: string;
  noticeKind?: "event-reminder" | "birthday-lead";
  /** notice rows only: precomputed label ("🔔 Dentist (in 3d)"). */
  leadLabel?: string;
  /** Jo checked it off — local only, never written back to Google. */
  done?: boolean;
  updatedAt: number;
}

/** User-editable right-edge jump button (seeded from the classic six). */
export interface SideButton {
  id: string;
  plannerId: string;
  order: number;
  /** 1–2 characters (emoji fall back to a letter in PDF exports). */
  glyph: string;
  label: string;
  /** Solid color — drives both the CSS gradient and pdf-lib's rgb(). */
  colorHex: string;
  /** "current-week" | a SECTIONS key | "page:<pageId>" (custom titled page). */
  target: string;
}

/** A floating Notepad note — app-global, shared across planner years. */
export interface Note {
  id: string;
  /** Typed title; "" auto-derives from the note's first text block. */
  title: string;
  /** Window rect as FRACTIONS of the viewport (resize-robust). */
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  open: boolean;
  /** Manual position for the "Custom" sort in the Notes menu. */
  order?: number;
  /** Writing surface width in CSS px at 1× (Jo r12): the note page is a
   *  fixed canvas the window looks at, so rotating the tablet never
   *  rescales her handwriting. Undefined = adopt the window's width once. */
  pageW?: number;
  createdAt: number;
  updatedAt: number;
}

/** A per-planner picture asset — today only the page background (Jo r15).
 *  Blobs live here rather than in planner.settings so backups can base64
 *  them like image blocks. */
export interface Asset {
  id: string;
  plannerId: string;
  kind: "background";
  blob: Blob;
  updatedAt: number;
}

export interface SyncQueueItem {
  seq?: number;
  table: string;
  rowId: string;
  op: "put" | "delete";
  ts: number;
}
