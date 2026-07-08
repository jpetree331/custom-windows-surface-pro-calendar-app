import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { listInstances, type FetchLike, type GEvent } from "./api";

/** Map one Google event instance to a planner event row. */
export function mapGoogleEvent(plannerId: string, g: GEvent): PlannerEvent | null {
  if (g.status === "cancelled") return null;
  const startDate = g.start?.date ?? g.start?.dateTime?.slice(0, 10);
  if (!startDate) return null;
  const allDay = !!g.start?.date;
  return {
    id: crypto.randomUUID(), // replaced by the existing row's id on upsert
    plannerId,
    googleId: g.id,
    kind: g.eventType === "birthday" ? "birthday" : "event",
    title: g.summary ?? "(untitled)",
    date: startDate,
    startTime: allDay ? undefined : g.start?.dateTime?.slice(11, 16),
    endTime: allDay ? undefined : g.end?.dateTime?.slice(11, 16),
    allDay,
    rrule: g.recurringEventId ? `instance-of:${g.recurringEventId}` : undefined,
    updatedAt: Date.now(),
  };
}

/** Upsert by googleId — repeated imports must never duplicate. */
export async function upsertEvents(rows: PlannerEvent[]): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  const savedIds: string[] = [];
  await db.transaction("rw", db.events, async () => {
    for (const row of rows) {
      const existing = row.googleId
        ? await db.events.where("googleId").equals(row.googleId).first()
        : undefined;
      const id = existing?.id ?? row.id;
      await db.events.put({ ...row, id });
      savedIds.push(id);
      existing ? updated++ : added++;
    }
  });
  for (const id of savedIds) await queueSync("events", id, "put");
  return { added, updated };
}

/**
 * Import the planner year from Google: regular events + birthdays.
 * Google expands recurring events into instances (singleEvents=true).
 */
export async function importYear(
  plannerId: string,
  year: number,
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<{ added: number; updated: number; total: number }> {
  const timeMin = new Date(year - 1, 11, 28).toISOString();
  const timeMax = new Date(year + 1, 0, 4).toISOString();
  const [regular, birthdays] = await Promise.all([
    listInstances(token, { timeMin, timeMax, eventTypes: ["default", "fromGmail"] }, fetchImpl),
    listInstances(token, { timeMin, timeMax, eventTypes: ["birthday"] }, fetchImpl),
  ]);
  const rows = [...regular, ...birthdays]
    .map((g) => mapGoogleEvent(plannerId, g))
    .filter((r): r is PlannerEvent => r !== null);
  const { added, updated } = await upsertEvents(rows);
  return { added, updated, total: rows.length };
}
