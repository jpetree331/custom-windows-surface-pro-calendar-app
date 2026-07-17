import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { listCalendars, listInstances, type FetchLike, type GEvent } from "./api";
import { listAllTasks } from "./tasks";

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

export interface ImportResult {
  added: number;
  updated: number;
  total: number;
  /** how many calendars contributed events */
  calendars: number;
  /** how many Google Tasks came in */
  tasks: number;
  warnings: string[];
}

/**
 * Import the planner year from Google: events from EVERY visible calendar
 * (appointments often live on secondary calendars, not just "primary"),
 * birthdays, and Google Tasks (categorized as To-Do). Recurring events arrive
 * pre-expanded (singleEvents=true). Each source degrades gracefully with a
 * user-facing warning if its scope/API isn't granted yet.
 */
export async function importYear(
  plannerId: string,
  year: number,
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<ImportResult> {
  const timeMin = new Date(year - 1, 11, 28).toISOString();
  const timeMax = new Date(year + 1, 0, 4).toISOString();
  const warnings: string[] = [];

  // Which calendars? Primary always; plus every calendar shown in her UI.
  let calendarIds = ["primary"];
  try {
    const all = await listCalendars(token, fetchImpl);
    const chosen = all.filter((c) => c.primary || c.selected);
    if (chosen.length > 0) calendarIds = chosen.map((c) => c.id);
  } catch {
    warnings.push(
      "Only your main calendar was checked — disconnect & reconnect Google to allow reading your other calendars."
    );
  }

  const perCalendar = await Promise.all(
    calendarIds.map((calendarId) =>
      listInstances(token, { calendarId, timeMin, timeMax, eventTypes: ["default", "fromGmail"] }, fetchImpl).catch(
        () => {
          warnings.push(`Calendar "${calendarId}" could not be read.`);
          return [] as GEvent[];
        }
      )
    )
  );
  const birthdays = await listInstances(token, { timeMin, timeMax, eventTypes: ["birthday"] }, fetchImpl).catch(
    () => [] as GEvent[]
  );

  const rows = [...perCalendar.flat(), ...birthdays]
    .map((g) => mapGoogleEvent(plannerId, g))
    .filter((r): r is PlannerEvent => r !== null);

  // Google Tasks → To-Do items on their due dates.
  let taskCount = 0;
  try {
    const tasks = await listAllTasks(token, { dueMin: timeMin, dueMax: timeMax }, fetchImpl);
    const cats = await db.categories.where("plannerId").equals(plannerId).toArray();
    const todoCat = cats.find((c) => /to.?do/i.test(c.name));
    for (const t of tasks) {
      if (!t.due || !t.title?.trim()) continue;
      rows.push({
        id: crypto.randomUUID(),
        plannerId,
        googleId: `task:${t.id}`,
        kind: "reminder",
        title: t.title,
        date: t.due.slice(0, 10),
        allDay: true,
        categoryId: todoCat?.id,
        updatedAt: Date.now(),
      });
      taskCount++;
    }
  } catch {
    warnings.push(
      "Google Tasks weren't imported — reconnect Google, and make sure the Google Tasks API is enabled for the app."
    );
  }

  const { added, updated } = await upsertEvents(rows);
  return { added, updated, total: rows.length, calendars: calendarIds.length, tasks: taskCount, warnings };
}
