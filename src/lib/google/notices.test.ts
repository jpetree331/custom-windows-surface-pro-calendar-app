import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/db";
import { ensureStarterCategories } from "@/lib/categories/actions";
import type { GEvent } from "./api";
import {
  deleteEventsFromCalendars,
  findImportedByTitle,
  importYear,
  isMoonPhaseTitle,
  purgeMoonPhaseDuplicates,
  setGoogleCalendarIds,
} from "./import";

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

/** Fixed "today": reminder expiry is date-sensitive, so pinning it keeps
 *  these tests from silently breaking as real time passes the fixtures. */
const TODAY = "2026-07-01";
const runImport = (f: ReturnType<typeof routeFetch>) =>
  importYear(PLANNER_ID, 2026, "tok", f, TODAY);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("derived notices (Jo: reminders shown on the day they fire)", () => {
  it("creates a display chip on the trigger day for reminders ≥ 24h only", async () => {
    const r = await runImport(routeFetch(routes([DENTIST_3D], [])));
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

  it("no longer invents its own birthday leads — Jo's Google notifications own that (r12)", async () => {
    await runImport(routeFetch(routes([], [BIRTHDAY])));
    const leads = (await db.events.toArray()).filter((e) => e.noticeKind === "birthday-lead");
    expect(leads).toEqual([]);
    // the birthday itself still imports
    expect(await db.events.where("googleId").equals("bday_mom").count()).toBe(1);
  });

  it("skips reminders whose event has already passed (r12)", async () => {
    // TODAY is 2026-07-01; this event is in June with a 3-day reminder
    const past: GEvent = {
      ...DENTIST_3D,
      id: "ev_past",
      start: { dateTime: "2026-06-20T14:00:00-05:00" },
      end: { dateTime: "2026-06-20T15:00:00-05:00" },
    };
    const r = await runImport(routeFetch(routes([past], [])));
    expect(r.notices).toBe(0);
  });

  it("regenerates idempotently — double sync never duplicates notices", async () => {
    const f = () => routeFetch(routes([DENTIST_3D], [BIRTHDAY]));
    await runImport(f());
    await runImport(f());
    const notices = (await db.events.toArray()).filter((e) => e.kind === "notice");
    expect(notices.length).toBe(1); // the dentist's 3-day reminder, nothing else
  });

  it("skips reminders that fire in the SAME Mon–Sun week as their event (Jo r11)", async () => {
    const friday: GEvent = {
      id: "ev_fri",
      summary: "Board meeting",
      start: { dateTime: "2026-07-24T09:00:00-05:00" }, // Friday
      end: { dateTime: "2026-07-24T10:00:00-05:00" },
      eventType: "default",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 2 * 1440 }, // Wed 22nd — same week → skipped
          { method: "popup", minutes: 7 * 1440 }, // Fri 17th — prior week → kept
        ],
      },
    };
    const r = await runImport(routeFetch(routes([friday], [])));
    expect(r.notices).toBe(1);
    const notice = (await db.events.toArray()).find((e) => e.kind === "notice")!;
    expect(notice.date).toBe("2026-07-17");
  });

  it("preserves the done-checkmark across re-imports and stops its reminders", async () => {
    await runImport(routeFetch(routes([DENTIST_3D], [])));
    const ev = (await db.events.where("googleId").equals("ev_dentist").first())!;
    await db.events.put({ ...ev, done: true });
    const r = await runImport(routeFetch(routes([DENTIST_3D], [])));
    const after = await db.events.where("googleId").equals("ev_dentist").first();
    expect(after?.done).toBe(true); // survives the upsert
    expect(r.notices).toBe(0); // done items need no reminding
  });

  it("keeps a dragged chip position across re-imports", async () => {
    await runImport(routeFetch(routes([DENTIST_3D], [])));
    const ev = (await db.events.where("googleId").equals("ev_dentist").first())!;
    await db.events.put({ ...ev, offsetX: 40, offsetY: 60 });
    await runImport(routeFetch(routes([DENTIST_3D], [])));
    const after = await db.events.where("googleId").equals("ev_dentist").first();
    expect(after).toMatchObject({ offsetX: 40, offsetY: 60 });
  });
});

describe("moon-phase title matching (r12: two prior fixes missed real formats)", () => {
  it("recognizes the forms Google calendars actually use", () => {
    for (const t of [
      "Full Moon",
      "Full moon",
      "full moon",
      "🌕 Full moon",
      "New Moon",
      "First Quarter",
      "Third Quarter",
      "Last Quarter Moon",
      "Full Moon 3:12 AM", // clock time in the title
      "Full Moon (Wolf Moon)", // monthly nickname
      "Waxing Gibbous", // daily-phase calendars
      "Full Moon", // non-breaking space
    ]) {
      expect(isMoonPhaseTitle(t), t).toBe(true);
    }
  });

  it("leaves Jo's own events alone", () => {
    for (const t of ["Full Moon party", "Moonlight dinner", "New Moon Yoga class", "", null]) {
      expect(isMoonPhaseTitle(t), String(t)).toBe(false);
    }
  });
});

describe("removing imported items by calendar and by name (r12)", () => {
  beforeEach(async () => {
    await db.events.bulkAdd([
      {
        id: "c1", plannerId: PLANNER_ID, googleId: "g1", calendarId: "moon@group.calendar.google.com",
        kind: "event", title: "Waning Crescent", date: "2026-07-02", allDay: true, updatedAt: 1,
      },
      {
        id: "c2", plannerId: PLANNER_ID, googleId: "g2", calendarId: "work@group.calendar.google.com",
        kind: "event", title: "Standup", date: "2026-07-02", allDay: true, updatedAt: 1,
      },
    ]);
  });

  it("unchecking a calendar removes exactly its items", async () => {
    const n = await deleteEventsFromCalendars(PLANNER_ID, ["moon@group.calendar.google.com"]);
    expect(n).toBe(1);
    expect((await db.events.toArray()).map((e) => e.title)).toEqual(["Standup"]);
  });

  it("name search finds imported rows whatever the phase wording", async () => {
    const hits = await findImportedByTitle(PLANNER_ID, "crescent");
    expect(hits.map((e) => e.id)).toEqual(["c1"]);
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
        // glyph-prefixed + "Third quarter" variants (Jo r11: purge hardening)
        id: "m3", plannerId: PLANNER_ID, googleId: "g_m3", kind: "event",
        title: "🌕 Full moon", date: "2026-08-08", allDay: true, updatedAt: 1,
      },
      {
        id: "m4", plannerId: PLANNER_ID, googleId: "g_m4", kind: "event",
        title: "Third quarter", date: "2026-08-15", allDay: true, updatedAt: 1,
      },
      {
        // Jo's own event that happens to mention the moon — NOT purged
        id: "keep", plannerId: PLANNER_ID, kind: "event",
        title: "Full Moon party", date: "2026-07-10", allDay: true, updatedAt: 1,
      },
    ]);
    const purged = await purgeMoonPhaseDuplicates(PLANNER_ID);
    expect(purged).toBe(4);
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
    const r = await runImport(f);
    expect(r.calendars).toBe(1); // only the checked calendar
    expect(await db.events.where("googleId").equals("ev_dentist").count()).toBe(1);
  });
});

describe("imported chips wear Jo's category colors (r13)", () => {
  const HOLIDAY_CAL = "en.usa#holiday@group.v.calendar.google.com";
  const APPOINTMENT: GEvent = {
    id: "ev_hair",
    summary: "Haircut",
    start: { dateTime: "2026-07-22T09:00:00-05:00" },
    end: { dateTime: "2026-07-22T10:00:00-05:00" },
    eventType: "default",
  };
  const JULY4: GEvent = {
    id: "ev_july4",
    summary: "Independence Day",
    start: { date: "2026-07-04" },
    end: { date: "2026-07-05" },
    eventType: "default",
  };
  const ANNIVERSARY: GEvent = {
    id: "ev_anniv",
    summary: "Wedding anniversary",
    start: { date: "2026-07-25" },
    end: { date: "2026-07-26" },
    eventType: "default",
  };

  /** primary + a holiday calendar + one due task. */
  const fullRoutes = (): [string, unknown][] => [
    [
      "/users/me/calendarList",
      { items: [{ id: "primary", primary: true }, { id: HOLIDAY_CAL, selected: true }] },
    ],
    ["eventTypes=birthday", { items: [BIRTHDAY] }],
    ["/calendars/primary/events", { items: [APPOINTMENT, ANNIVERSARY] }],
    [`/calendars/${HOLIDAY_CAL}/events`, { items: [JULY4] }],
    ["/users/@me/lists", { items: [{ id: "L1", title: "My Tasks" }] }],
    ["/lists/L1/tasks", { items: [{ id: "t1", title: "Renew tags", due: "2026-07-23T00:00:00Z" }] }],
  ];

  const colorOf = async (title: string) => {
    const ev = (await db.events.toArray()).find((e) => e.title === title);
    const cats = await db.categories.toArray();
    return cats.find((c) => c.id === ev?.categoryId)?.name;
  };

  it("maps holidays, birthdays, anniversaries, appointments and tasks", async () => {
    await ensureStarterCategories(PLANNER_ID);
    await runImport(routeFetch(fullRoutes()));
    expect(await colorOf("Independence Day")).toBe("Holidays");
    expect(await colorOf("Mom's birthday")).toBe("Birthdays");
    expect(await colorOf("Wedding anniversary")).toBe("Birthdays");
    expect(await colorOf("Haircut")).toBe("Appointments");
    expect(await colorOf("Renew tags")).toBe("To-Do List");
  });

  it("never overwrites a category Jo picked by hand", async () => {
    await ensureStarterCategories(PLANNER_ID);
    await runImport(routeFetch(fullRoutes()));
    const cats = await db.categories.toArray();
    const misc = cats.find((c) => c.name === "Misc.")!;
    const hair = (await db.events.toArray()).find((e) => e.title === "Haircut")!;
    await db.events.update(hair.id, { categoryId: misc.id });
    await runImport(routeFetch(fullRoutes()));
    expect(await colorOf("Haircut")).toBe("Misc.");
  });
});
