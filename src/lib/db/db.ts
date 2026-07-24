import Dexie, { type EntityTable } from "dexie";
import type {
  Planner,
  Page,
  Stroke,
  Block,
  Habit,
  HabitCheck,
  Category,
  PlannerEvent,
  SyncQueueItem,
} from "./types";

/** IndexedDB via Dexie — the on-device source of truth. */
export class JotterDB extends Dexie {
  planners!: EntityTable<Planner, "id">;
  pages!: EntityTable<Page, "id">;
  strokes!: EntityTable<Stroke, "id">;
  blocks!: EntityTable<Block, "id">;
  habits!: EntityTable<Habit, "id">;
  habitChecks!: EntityTable<HabitCheck, "id">;
  categories!: EntityTable<Category, "id">;
  events!: EntityTable<PlannerEvent, "id">;
  syncQueue!: EntityTable<SyncQueueItem, "seq">;
  /** Device-local key/value store (e.g. the chosen save-folder handle).
   *  Deliberately NOT part of backups — it's per-device state. */
  kv!: EntityTable<{ key: string; value: unknown }, "key">;

  constructor() {
    super("jotter");
    this.version(1).stores({
      planners: "id, year",
      pages: "id, plannerId, [plannerId+index], type",
      strokes: "id, pageId",
      blocks: "id, pageId",
      habits: "id, plannerId",
      habitChecks: "id, habitId, [habitId+date]",
      categories: "id, plannerId",
      events: "id, plannerId, date, googleId",
      syncQueue: "++seq, table",
    });
    // v2: additive kv store only — no existing table changes, no data migration.
    this.version(2).stores({
      kv: "key",
    });
  }
}

export const db = new JotterDB();
