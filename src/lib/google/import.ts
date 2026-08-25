import { db } from "@/lib/db/db";
import type { PlannerEvent } from "@/lib/db/types";
import { queueSync } from "@/lib/sync";
import { addDays, fromISO, mondayOf as mondayOfDate, toISO } from "@/lib/planner/dates";
import { listCalendars, listInstances, type FetchLike, type GEvent } from "./api";
import { listAllTasks } from "./tasks";

/** Map one Google event instance to a planner event row. */
export function mapGoogleEvent(plannerId: string, g: GEvent, calendarId?: string): PlannerEvent | null {
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
    calendarId,
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
 * Normalize a Google title for phase matching: drop parentheticals
 * ("(Wolf Moon)"), clock times ("3:12 AM"), percentages, emoji and any other
 * non-letters, then collapse whitespace. Unicode spaces become real spaces
 * BEFORE stripping, or "Full Moon" would collapse to "fullmoon".
 */
function normalizeTitle(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b\d{1,2}:\d{2}\s*[ap]\.?m?\.?\b/g, " ")
    .replace(/\d+\s*%/g, " ")
    .replace(/\s+/gu, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phase names, with or without a trailing "moon"/"phase" word. Broader than
 * MOON_NAMES in src/lib/calendar/moon.ts (our own glyph vocabulary, the four
 * principal phases) because subscribed calendars also post the intermediate
 * phases — this regex is the authority for "is this an imported phase row".
 */
const MOON_TITLE_RE =
  /^(new|full|first quarter|second quarter|third quarter|last quarter|waxing crescent|waning crescent|waxing gibbous|waning gibbous)( moon)?( phase)?$/;

export function isMoonPhaseTitle(raw: unknown): boolean {
  const t = normalizeTitle(raw);
  return !!t && MOON_TITLE_RE.test(t);
}

/**
 * Purge moon-phase TEXT events that arrived from a subscribed "Phases of the
 * Moon" Google calendar (they duplicate our computed glyphs). Runs at app
 * launch AND on both sides of an import — an import used to re-add them
 * moments after purging, which is why syncing never seemed to help (Jo r12).
 * Never throws: a malformed row must not silently kill the whole sweep.
 */
export async function purgeMoonPhaseDuplicates(plannerId: string): Promise<number> {
  try {
    const stale = await db.events
      .where("plannerId").equals(plannerId)
      .and((e) => !!e.googleId && isMoonPhaseTitle(e.title))
      .toArray();
    if (stale.length) {
      await db.events.bulkDelete(stale.map((e) => e.id));
      for (const e of stale) await queueSync("events", e.id, "delete");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        "jotter.lastMoonPurge",
        JSON.stringify({ at: Date.now(), deleted: stale.length })
      );
    }
    return stale.length;
  } catch (err) {
    console.error("purgeMoonPhaseDuplicates failed", err);
    return 0;
  }
}

/** Imported rows whose title contains `needle` — powers the Settings
 *  "remove imported items" cleanup, which works whatever the titles look
 *  like (no guessing about a calendar's naming style). */
export async function findImportedByTitle(
  plannerId: string,
  needle: string
): Promise<PlannerEvent[]> {
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  return db.events
    .where("plannerId").equals(plannerId)
    .and((e) => !!e.googleId && String(e.title ?? "").toLowerCase().includes(q))
    .toArray();
}

/** Delete imported rows that came from these Google calendars — what
 *  unchecking a calendar in the settings list should actually do. */
export async function deleteEventsFromCalendars(
  plannerId: string,
  calendarIds: string[]
): Promise<number> {
  if (calendarIds.length === 0) return 0;
  const set = new Set(calendarIds);
  const rows = await db.events
    .where("plannerId").equals(plannerId)
    .and((e) => !!e.calendarId && set.has(e.calendarId))
    .toArray();
  return deleteEvents(rows.map((e) => e.id));
}

export async function deleteEvents(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db.events.bulkDelete(ids);
  for (const id of ids) await queueSync("events", id, "delete");
  return ids.length;
}

const addDaysISO = (iso: string, days: number) => toISO(addDays(fromISO(iso), days));

/** Monday of the ISO date's week — the planner's week identity. */
const mondayOf = (iso: string) => toISO(mondayOfDate(fromISO(iso)));

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
    parentDate: parent.date,
    noticeKind,
    leadLabel,
    categoryId: parent.categoryId,
    updatedAt: Date.now(),
  };
}

/**
 * Derived display rows: 🔔 chips on the day one of Jo's Google notifications
 * fires (display-only — the app can't ring). Wiped and rebuilt every import
 * so they always match Google — never diffed, never draggable, never counted
 * as imports.
 *
 * r12: the app no longer invents its own 1-week/2-week birthday leads — Jo
 * sets those as Google notifications herself, and generating both doubled
 * every chip. Reminders for events that have already happened aren't
 * generated either (see also the render-time guard for un-synced days).
 */
export async function regenerateNotices(plannerId: string, todayISO = toISO(new Date())): Promise<number> {
  const events = await db.events.where("plannerId").equals(plannerId).toArray();
  const stale = events.filter((e) => e.kind === "notice");
  const notices: PlannerEvent[] = [];
  for (const p of events) {
    if (p.kind === "notice") continue;
    if (p.done) continue; // checked-off items need no reminding (Jo r11)
    if (p.date < todayISO) continue; // the event has passed (Jo r12)
    for (const min of p.reminderOverridesMin ?? []) {
      const days = Math.round(min / 1440);
      const fireDate = addDaysISO(p.date, -days);
      // A reminder that fires in the SAME Mon–Sun week as its event is
      // redundant — the event is already visible on that week page (Jo r11).
      if (mondayOf(fireDate) === mondayOf(p.date)) continue;
      notices.push(
        makeNotice(plannerId, p, fireDate, "event-reminder", `🔔 ${p.title} (in ${days}d)`)
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
      // Keep Jo's dragged chip position AND her done-checkmark across re-imports.
      await db.events.put({
        ...row,
        id,
        offsetX: existing?.offsetX,
        offsetY: existing?.offsetY,
        done: existing?.done,
        // a category she picked herself outranks the import's default
        categoryId: existing?.categoryId ?? row.categoryId,
      });
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
  /** derived reminder chips regenerated this run */
  notices: number;
  /** moon-phase rows removed this run (0 is the healthy steady state) */
  moonPurged: number;
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
  fetchImpl: FetchLike = fetch,
  /** "today" for reminder expiry — injectable so tests don't drift with the
   *  wall clock (they broke the day real time passed their fixtures). */
  todayISO = toISO(new Date())
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
    // Forget saved calendars that no longer exist on the account: an
    // unsubscribed calendar must not linger in Jo's checklist forever.
    if (chosenIds) {
      const live = chosenIds.filter((id) => all.some((c) => c.id === id));
      if (live.length !== chosenIds.length) await setGoogleCalendarIds(plannerId, live);
    }
  } catch {
    warnings.push(
      "Only your main calendar was checked — disconnect & reconnect Google to allow reading your other calendars."
    );
  }

  const perCalendar = await Promise.all(
    calendarIds.map(async (calendarId) => ({
      calendarId,
      events: await listInstances(
        token,
        { calendarId, timeMin, timeMax, eventTypes: ["default", "fromGmail"] },
        fetchImpl
      ).catch(() => {
        warnings.push(`Calendar "${calendarId}" could not be read.`);
        return [] as GEvent[];
      }),
    }))
  );
  const birthdays = await listInstances(token, { timeMin, timeMax, eventTypes: ["birthday"] }, fetchImpl).catch(
    () => [] as GEvent[]
  );

  // each row remembers its source calendar (Jo r12) so unchecking a calendar
  // can remove exactly its items instead of pattern-matching titles
  const rows = [
    ...perCalendar.flatMap(({ calendarId, events }) =>
      events.map((g) => mapGoogleEvent(plannerId, g, calendarId))
    ),
    ...birthdays.map((g) => mapGoogleEvent(plannerId, g, "birthdays")),
  ].filter((r): r is PlannerEvent => r !== null);

  // Google Tasks → To-Do items on their due dates.
  let taskCount = 0;
  const cats = await db.categories.where("plannerId").equals(plannerId).toArray();
  const todoCat = cats.find((c) => /to.?do/i.test(c.name));
  try {
    const tasks = await listAllTasks(token, { dueMin: timeMin, dueMax: timeMax }, fetchImpl);
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

  // Imported chips wear her own category colors (Jo r13): holidays pink,
  // birthdays & anniversaries orange, appointments turquoise, tasks purple.
  const catFor = (r: PlannerEvent) => {
    const byName = (re: RegExp) => cats.find((c) => re.test(c.name))?.id;
    if (r.kind === "reminder") return todoCat?.id;
    if (r.kind === "birthday" || /\banniversar/i.test(r.title)) return byName(/birthday/i);
    if (r.calendarId && /holiday/i.test(r.calendarId)) return byName(/holiday/i);
    return byName(/appoint/i);
  };
  for (const r of rows) r.categoryId = r.categoryId ?? catFor(r);

  const { added, updated } = await upsertEvents(rows);
  // AGAIN, after the upsert: purging only up front let a still-subscribed
  // moon calendar re-add every chip in the same sync — which is exactly why
  // syncing repeatedly never cleaned them up (Jo r12).
  const moonPurged = await purgeMoonPhaseDuplicates(plannerId);
  const notices = await regenerateNotices(plannerId, todayISO);
  return {
    added,
    updated,
    total: rows.length,
    calendars: calendarIds.length,
    tasks: taskCount,
    notices,
    moonPurged,
    warnings,
  };
}
