import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/db";
import type { GEvent } from "./api";
import { importYear, purgeMoonPhaseDuplicates, setGoogleCalendarIds } from "./import";

const PLANNER_ID = "p1";

function routeFetch(routes: [string, unknown][]): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = decodeURIComponent(String(url));
    const hit = routes.find(([frag]) => u.includes(frag));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  }) as unknown as typeof fetch;
}

const DENTIST_3D: GEvent = {
  id: "ev_dentist",
  summary: "Dentist",
  start: { dateTime: "2026-07-20T14:00:00-05:00" },
  end: { dateTime: "2026-07-20T15:00:00-05:00" },
  eventType: "default",
  reminders: {
    useDefault: false,
    overrides: [
      { method: "popup", minutes: 3 * 1440 }, // 3 days → notice
      { method: "popup", minutes: 30 }, // < 24h → ignored
    ],
  },
};

const BIRTHDAY: GEvent = {
  id: "bday_mom",
  summary: "Mom's birthday",
  start: { date: "2026-07-21" },
  end: { date: "2026-07-22" },
  eventType: "birthday",
};

function routes(events: GEvent[], birthdays: GEvent[], calendars?: unknown): [string, unknown][] {
  return [
    ["/users/me/calendarList", calendars ?? { items: [{ id: "primary", primary: true }] }],
    ["eventTypes=birthday", { items: birthdays }],
    ["/calendars/primary/events", { items: events }],
    ["/users/@me/lists", { items: [] }],
  ];
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("derived notices (Jo: reminders shown on the day they fire)", () => {
  it("creates a display chip on the trigger day for reminders ≥ 24h only", async () => {
    const r = await importYear(PLANNER_ID, 2026, "tok", routeFetch(routes([DENTIST_3D], [])));
    expect(r.notices).toBe(1);
    const notice = (await db.events.toArray()).find((e) => e.kind === "notice")!;
    expect(notice).toMatchObject({
      noticeKind: "event-reminder",
      date: "2026-07-17", // 3 days before the 20th
    });
    expect(notice.leadLabel).toContain("Dentist");
    expect(notice.leadLabel).toContain("3d");
    // parent keeps only the ≥24h override for the details popover
    const parent = await db.events.where("googleId").equals("ev_dentist").first();
    expect(parent?.reminderOverridesMin).toEqual([3 * 1440]);
  });

  it("gives every Google birthday 1-week and 2-week lead chips", async () => {
    await importYear(PLANNER_ID, 2026, "tok", routeFetch(routes([], [BIRTHDAY])));
    const leads = (await db.events.toArray())
      .filter((e) => e.noticeKind === "birthday-lead")
      .sort((a, b) => a.date.localeCompare(b.date));
    expect(leads.map((l) => l.date)).toEqual(["2026-07-07", "2026-07-14"]);
    expect(leads[0].leadLabel).toBe("🎂 Mom's birthday in 2 wk");
    expect(leads[1].leadLabel).toBe("🎂 Mom's birthday in 1 wk");
  });

  it("regenerates idempotently — double sync never duplicates notices", async () => {
    const f = () => routeFetch(routes([DENTIST_3D], [BIRTHDAY]));
    await importYear(PLANNER_ID, 2026, "tok", f());
    await importYear(PLANNER_ID, 2026, "tok", f());
    const notices = (await db.events.toArray()).filter((e) => e.kind === "notice");
    expect(notices.length).toBe(3); // 1 reminder + 2 birthday leads
  });

  it("keeps a dragged chip position across re-imports", async () => {
    await importYear(PLANNER_ID, 2026, "tok", routeFetch(routes([DENTIST_3D], [])));
    const ev = (await db.events.where("googleId").equals("ev_dentist").first())!;
    await db.events.put({ ...ev, offsetX: 40, offsetY: 60 });
    await importYear(PLANNER_ID, 2026, "tok", routeFetch(routes([DENTIST_3D], [])));
    const after = await db.events.where("googleId").equals("ev_dentist").first();
    expect(after).toMatchObject({ offsetX: 40, offsetY: 60 });
  });
});

describe("moon-phase cleanup + calendar checklist", () => {
  it("purges already-imported moon-phase text events (glyphs are computed separately)", async () => {
    await db.events.bulkAdd([
      {
        id: "m1", plannerId: PLANNER_ID, googleId: "g_m1", kind: "event",
        title: "Full Moon", date: "2026-07-10", allDay: true, updatedAt: 1,
      },
      {
        // Google's actual casing — "New moon", not "New Moon" (Jo round 10)
        id: "m2", plannerId: PLANNER_ID, googleId: "g_m2", kind: "event",
        title: "New moon", date: "2026-07-24", allDay: true, updatedAt: 1,
      },
      {
        // Jo's own event that happens to mention the moon — NOT purged
        id: "keep", plannerId: PLANNER_ID, kind: "event",
        title: "Full Moon party", date: "2026-07-10", allDay: true, updatedAt: 1,
      },
    ]);
    const purged = await purgeMoonPhaseDuplicates(PLANNER_ID);
    expect(purged).toBe(2);
    const titles = (await db.events.toArray()).map((e) => e.title);
    expect(titles).toEqual(["Full Moon party"]);
  });

  it("honors the settings checklist when choosing calendars", async () => {
    await db.planners.add({
      id: PLANNER_ID, year: 2026, title: "t", settings: {}, createdAt: 1, updatedAt: 1,
    });
    await setGoogleCalendarIds(PLANNER_ID, ["work@group.calendar.google.com"]);
    const f = routeFetch([
      ["/users/me/calendarList", { items: [
        { id: "primary", primary: true },
        { id: "work@group.calendar.google.com", selected: false },
        { id: "moon@group.calendar.google.com", selected: true }, // unchecked by Jo
      ] }],
      ["eventTypes=birthday", { items: [] }],
      ["/calendars/work@group.calendar.google.com/events", { items: [DENTIST_3D] }],
      ["/users/@me/lists", { items: [] }],
    ]);
    const r = await importYear(PLANNER_ID, 2026, "tok", f);
    expect(r.calendars).toBe(1); // only the checked calendar
    expect(await db.events.where("googleId").equals("ev_dentist").count()).toBe(1);
  });
});
