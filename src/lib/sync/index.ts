import { db } from "@/lib/db/db";
import { getSupabase } from "@/lib/supabase/client";

/** Record a local mutation so the background sync can replay it to Supabase. */
export async function queueSync(table: string, rowId: string, op: "put" | "delete") {
  await db.syncQueue.add({ table, rowId, op, ts: Date.now() });
}

/**
 * Background sync stub (Phase 0). Drains nothing yet — real push/pull with
 * last-write-wins lands in a later phase. Never blocks the UI.
 */
export async function sync(): Promise<{ pushed: number; pulled: number }> {
  const supabase = getSupabase();
  if (!supabase) return { pushed: 0, pulled: 0 }; // offline / unconfigured
  // TODO(sync): drain syncQueue -> upsert/delete to Supabase; pull deltas by updated_at.
  return { pushed: 0, pulled: 0 };
}
