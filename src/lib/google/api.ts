/**
 * Thin Google Calendar v3 REST client. Endpoint + params verified against
 * developers.google.com/workspace/calendar/api/v3/reference (2026-07-08).
 * `fetchImpl` is injectable for tests.
 */

const BASE = "https://www.googleapis.com/calendar/v3";

export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  recurringEventId?: string;
  recurrence?: string[];
  eventType?: string;
  attendees?: { email: string }[];
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function gFetch(
  token: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  const res = await fetchImpl(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * All event INSTANCES in a window (recurring events pre-expanded by Google via
 * singleEvents=true — native RRULE handling, no local expansion needed).
 */
export async function listInstances(
  token: string,
  opts: {
    calendarId?: string;
    timeMin: string; // RFC3339
    timeMax: string;
    eventTypes?: string[];
  },
  fetchImpl: FetchLike = fetch
): Promise<GEvent[]> {
  const calendarId = encodeURIComponent(opts.calendarId ?? "primary");
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      maxResults: "2500",
      orderBy: "startTime",
    });
    for (const t of opts.eventTypes ?? []) params.append("eventTypes", t);
    if (pageToken) params.set("pageToken", pageToken);
    const page = (await gFetch(
      token,
      `/calendars/${calendarId}/events?${params}`,
      {},
      fetchImpl
    )) as { items?: GEvent[]; nextPageToken?: string };
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

export interface GCalendar {
  id: string;
  summary?: string;
  primary?: boolean;
  /** true when the calendar is checked (shown) in Google Calendar's UI. */
  selected?: boolean;
}

/** All calendars on the account (needs calendar.readonly scope). */
export async function listCalendars(
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<GCalendar[]> {
  const items: GCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ minAccessRole: "reader", maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = (await gFetch(token, `/users/me/calendarList?${params}`, {}, fetchImpl)) as {
      items?: GCalendar[];
      nextPageToken?: string;
    };
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * Create an event — used for repeats (RRULE), reminders, and inviting a
 * contact as an attendee (Gate B's "share to Google Contacts" reading).
 */
export async function insertEvent(
  token: string,
  event: {
    summary: string;
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
    recurrence?: string[]; // e.g. ["RRULE:FREQ=WEEKLY"]
    attendees?: { email: string }[];
    reminders?: { useDefault: boolean; overrides?: { method: "popup" | "email"; minutes: number }[] };
  },
  fetchImpl: FetchLike = fetch
): Promise<GEvent> {
  const params = event.attendees?.length ? "?sendUpdates=all" : "";
  return (await gFetch(token, `/calendars/primary/events${params}`, {
    method: "POST",
    body: JSON.stringify(event),
  }, fetchImpl)) as GEvent;
}
