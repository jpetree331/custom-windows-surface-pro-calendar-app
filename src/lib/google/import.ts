import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { MOON_NAMES } from "@/lib/calendar/moon";
import { addDays, fromISO, toISO } from "@/lib/planner/dates";
import { listCalendars, listInstances, type FetchLike, type GEvent } from "./api";
import { listAllTasks } from "./tasks";

/** Map one Google event instance to a planner event row. */
export function mapGoogleEvent(plannerId: string, g: GEvent): PlannerEvent | null {
  if (g.status === "cancelled") return null;
  const startDate = g.start?.date ?? g.start?.dateTime?.slice(0, 10);
  if (!startDate) return null;
  const allDay = !!g.start?.date;
  // Only explicit per-event overrides ≥ 24h count — calendar-level defaults
  // are factory 10-minute popups, not something Jo set on purpose.
  const reminderMins = (g.reminders?.overrides ?? [])
    .map((o) => o.minutes)
    .filter((m) => m >= 1440);
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
    description: g.description,
    location: g.location,
    reminderOverridesMin: reminderMins.length ? reminderMins : undefined,
    updatedAt: Date.now(),
  };
}

/** Persist which Google calendars feed this planner (settings checklist). */
export async function setGoogleCalendarIds(plannerId: string, ids: string[] | null) {
  const p = await db.planners.get(plannerId);
  if (!p) return;
  const settings = { ...p.settings };
  if (ids === null) delete settings.googleCalendarIds;
  else settings.googleCalendarIds = ids;
  await db.planners.update(plannerId, { settings, updatedAt: Date.now() });
  await queueSync("planners", plannerId, "put");
}

export async function getGoogleCalendarIds(plannerId: string): Promise<string[] | undefined> {
  const p = await db.planners.get(plannerId);
  const ids = p?.settings?.googleCalendarIds;
  return Array.isArray(ids) ? (ids as string[]) : undefined;
}

/**
 * Purge moon-phase TEXT events that arrived from a subscribed "Phases of the
 * Moon" Google calendar (Jo: they duplicate our computed glyphs). Runs on
 * every import — idempotent, self-healing if the calendar sneaks back in.
 */
export async function purgeMoonPhaseDuplicates(plannerId: string): Promise<number> {
  const stale = await db.events
    .where("plannerId").equals(plannerId)
    .and((e) => !!e.googleId && (MOON_NAMES as readonly string[]).includes(e.title))
    .toArray();
  if (stale.length) {
    await db.events.bulkDelete(stale.map((e) => e.id));
    for (const e of stale) await queueSync("events", e.id, "delete");
  }
  return stale.length;
}

const addDaysISO = (iso: string, days: number) => toISO(addDays(fromISO(iso), days));

function makeNotice(
  plannerId: string,
  parent: PlannerEvent,
  date: string,
  noticeKind: "event-reminder" | "birthday-lead",
  leadLabel: string
): PlannerEvent {
  return {
    id: crypto.randomUUID(),
    plannerId,
    kind: "notice",
    title: leadLabel,
    date,
    allDay: true,
    sourceEventId: parent.id,
    noticeKind,
    leadLabel,
    categoryId: parent.categoryId,
    updatedAt: Date.now(),
  };
}

/**
 * Derived display rows: 🔔 chips on the day a Google notification fires
 * (display-only — the app can't ring), and 🎂 1-week/2-week leads for each
 * Google birthday. Wiped and rebuilt every import so they always match
 * Google — never diffed, never draggable, never counted as imports.
 */
export async function regenerateNotices(plannerId: string): Promise<number> {
  const events = await db.events.where("plannerId").equals(plannerId).toArray();
  const stale = events.filter((e) => e.kind === "notice");
  const notices: PlannerEvent[] = [];
  for (const p of events) {
    if (p.kind === "notice") continue;
    if (p.kind === "birthday") {
      for (const [weeks, label] of [[2, "2 wk"], [1, "1 wk"]] as const) {
        notices.push(
          makeNotice(plannerId, p, addDaysISO(p.date, -weeks * 7), "birthday-lead", `🎂 ${p.title} in ${label}`)
        );
      }
    }
    for (const min of p.reminderOverridesMin ?? []) {
      const days = Math.round(min / 1440);
      notices.push(
        makeNotice(plannerId, p, addDaysISO(p.date, -days), "event-reminder", `🔔 ${p.title} (in ${days}d)`)
      );
    }
  }
  await db.transaction("rw", db.events, async () => {
    await db.events.bulkDelete(stale.map((e) => e.id));
    if (notices.length) await db.events.bulkAdd(notices);
  });
  for (const e of stale) await queueSync("events", e.id, "delete");
  for (const n of notices) await queueSync("events", n.id, "put");
  return notices.length;
}

/** Upsert by googleId — repeated imports must never duplicate. */
export async function upsertEvents(rows: PlannerEvent[]): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  const savedIds: string[] = [];
  await db.transaction("rw", db.events, async () => {
    for (const row of rows) {
      // Planner-scoped: consecutive years' import windows overlap Dec 28 –
      // Jan 4, and an unscoped googleId match would steal the row across
      // planners on every auto-sync.
      const existing = row.googleId
        ? await db.events
            .where("googleId").equals(row.googleId)
            .and((e) => e.plannerId === row.plannerId)
            .first()
        : undefined;
      const id = existing?.id ?? row.id;
      // Keep Jo's dragged chip position across re-imports.
      await db.events.put({ ...row, id, offsetX: existing?.offsetX, offsetY: existing?.offsetY });
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
  /** derived reminder/birthday-lead chips regenerated this run */
  notices: number;
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

  await purgeMoonPhaseDuplicates(plannerId);

  // Which calendars? The settings checklist decides; when Jo hasn't chosen,
  // primary + every calendar shown in her Google UI (original behavior).
  const chosenIds = await getGoogleCalendarIds(plannerId);
  let calendarIds = ["primary"];
  try {
    const all = await listCalendars(token, fetchImpl);
    const chosen = chosenIds
      ? all.filter((c) => chosenIds.includes(c.id))
      : all.filter((c) => c.primary || c.selected);
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
  const notices = await regenerateNotices(plannerId);
  return { added, updated, total: rows.length, calendars: calendarIds.length, tasks: taskCount, notices, warnings };
}
