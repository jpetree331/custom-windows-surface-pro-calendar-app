import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/db";
import { listInstances, insertEvent, type GEvent } from "./api";
import { importYear, mapGoogleEvent } from "./import";

const PLANNER_ID = "p1";

function mockFetch(pages: Record<string, unknown>[]): typeof fetch {
  let call = 0;
  return vi.fn(async (url: RequestInfo | URL) => {
    void url;
    const body = pages[Math.min(call++, pages.length - 1)];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

const WEEKLY_INSTANCES: GEvent[] = [0, 1, 2].map((i) => ({
  id: `rec_inst_${i}`,
  summary: "Yoga",
  recurringEventId: "rec_master",
  start: { dateTime: `2026-07-${String(6 + i * 7).padStart(2, "0")}T09:00:00-05:00` },
  end: { dateTime: `2026-07-${String(6 + i * 7).padStart(2, "0")}T10:00:00-05:00` },
  eventType: "default",
}));

const SINGLE: GEvent = {
  id: "single_1",
  summary: "Dentist",
  start: { dateTime: "2026-07-08T14:00:00-05:00" },
  end: { dateTime: "2026-07-08T15:00:00-05:00" },
  eventType: "default",
  reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
};

const BIRTHDAY: GEvent = {
  id: "bday_1",
  summary: "Sam's birthday",
  start: { date: "2026-07-10" },
  end: { date: "2026-07-11" },
  eventType: "birthday",
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("mapGoogleEvent", () => {
  it("maps timed, all-day, birthday, and recurring-instance events", () => {
    const single = mapGoogleEvent(PLANNER_ID, SINGLE)!;
    expect(single).toMatchObject({
      googleId: "single_1", kind: "event", date: "2026-07-08",
      startTime: "14:00", endTime: "15:00", allDay: false,
    });
    const bday = mapGoogleEvent(PLANNER_ID, BIRTHDAY)!;
    expect(bday).toMatchObject({ kind: "birthday", date: "2026-07-10", allDay: true });
    const inst = mapGoogleEvent(PLANNER_ID, WEEKLY_INSTANCES[1])!;
    expect(inst.rrule).toBe("instance-of:rec_master");
    expect(inst.date).toBe("2026-07-13");
    expect(mapGoogleEvent(PLANNER_ID, { ...SINGLE, status: "cancelled" })).toBeNull();
  });
});

describe("importYear", () => {
  it("imports events + birthdays; repeating event lands on every instance day", async () => {
    const f = mockFetch([
      { items: [SINGLE, ...WEEKLY_INSTANCES] }, // default+fromGmail call
      { items: [BIRTHDAY] }, // birthday call
    ]);
    const r = await importYear(PLANNER_ID, 2026, "tok", f);
    expect(r).toEqual({ added: 5, updated: 0, total: 5 });
    const dates = (await db.events.toArray()).filter((e) => e.rrule).map((e) => e.date).sort();
    expect(dates).toEqual(["2026-07-06", "2026-07-13", "2026-07-20"]);
  });

  it("repeated syncs never duplicate (upsert by googleId)", async () => {
    const pages = [{ items: [SINGLE, ...WEEKLY_INSTANCES] }, { items: [BIRTHDAY] }];
    await importYear(PLANNER_ID, 2026, "tok", mockFetch(pages));
    const r2 = await importYear(PLANNER_ID, 2026, "tok", mockFetch(pages));
    expect(r2).toEqual({ added: 0, updated: 5, total: 5 });
    expect(await db.events.count()).toBe(5);
    // title update flows through on re-import
    const renamed = { ...SINGLE, summary: "Dentist (moved)" };
    await importYear(PLANNER_ID, 2026, "tok", mockFetch([{ items: [renamed] }, { items: [] }]));
    const row = await db.events.where("googleId").equals("single_1").first();
    expect(row?.title).toBe("Dentist (moved)");
    expect(await db.events.count()).toBe(5);
  });
});

describe("api layer", () => {
  it("listInstances requests singleEvents expansion and follows pageTokens", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      expect(u).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      expect(u).toContain("singleEvents=true");
      if (!u.includes("pageToken")) {
        return new Response(JSON.stringify({ items: [SINGLE], nextPageToken: "p2" }));
      }
      return new Response(JSON.stringify({ items: [BIRTHDAY] }));
    }) as unknown as typeof fetch;
    const items = await listInstances("tok", { timeMin: "2026-01-01T00:00:00Z", timeMax: "2027-01-01T00:00:00Z" }, f);
    expect(items.map((i) => i.id)).toEqual(["single_1", "bday_1"]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("insertEvent posts RRULE + attendees and requests invite emails", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: "new_1" }));
    }) as unknown as typeof fetch;
    await insertEvent("tok", {
      summary: "Coffee",
      start: { dateTime: "2026-07-10T10:00:00", timeZone: "America/Chicago" },
      end: { dateTime: "2026-07-10T11:00:00", timeZone: "America/Chicago" },
      recurrence: ["RRULE:FREQ=WEEKLY"],
      attendees: [{ email: "friend@example.com" }],
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
    }, f);
    expect(captured!.url).toContain("sendUpdates=all"); // attendee gets the invite
    expect(captured!.body.recurrence).toEqual(["RRULE:FREQ=WEEKLY"]);
    expect((captured!.body.attendees as { email: string }[])[0].email).toBe("friend@example.com");
  });
});
