import { describe, expect, it } from "vitest";
import { SearchMoonQuarter, NextMoonQuarter } from "astronomy-engine";
import { easterSunday, holidaysForYear } from "./holidays";
import { moonPhasesForYear } from "./moon";
import { toISO } from "@/lib/planner/dates";

describe("holidays 2026 (cross-checked against the published US federal list)", () => {
  const h = holidaysForYear(2026);
  const has = (iso: string, name: string) => h.get(iso)?.includes(name) ?? false;

  it("computes every 2026 federal holiday on its published date", () => {
    expect(has("2026-01-01", "New Year's Day")).toBe(true);
    expect(has("2026-01-19", "MLK Day")).toBe(true); // 3rd Mon Jan
    expect(has("2026-02-16", "Presidents' Day")).toBe(true); // 3rd Mon Feb
    expect(has("2026-05-25", "Memorial Day")).toBe(true); // last Mon May
    expect(has("2026-06-19", "Juneteenth")).toBe(true);
    expect(has("2026-07-04", "Independence Day")).toBe(true);
    expect(has("2026-09-07", "Labor Day")).toBe(true); // 1st Mon Sep
    expect(has("2026-10-12", "Indigenous Peoples' Day")).toBe(true); // 2nd Mon Oct
    expect(has("2026-11-11", "Veterans Day")).toBe(true);
    expect(has("2026-11-26", "Thanksgiving")).toBe(true); // 4th Thu Nov
    expect(has("2026-12-25", "Christmas")).toBe(true);
  });

  it("computes Easter 2026 = April 5 (computus) and Good Friday = April 3", () => {
    expect(toISO(easterSunday(2026))).toBe("2026-04-05");
    expect(has("2026-04-05", "Easter")).toBe(true);
    expect(has("2026-04-03", "Good Friday")).toBe(true);
  });

  it("common observances land correctly", () => {
    expect(has("2026-02-14", "Valentine's Day")).toBe(true);
    expect(has("2026-05-10", "Mother's Day")).toBe(true); // 2nd Sun May
    expect(has("2026-06-21", "Father's Day")).toBe(true); // 3rd Sun Jun
    expect(has("2026-10-31", "Halloween")).toBe(true);
  });
});

describe("moon phases 2026 (cross-checked against published lunar calendars in UTC)", () => {
  // Published anchors, all UTC instants (rmg.co.uk, astronomy.com, chani.com,
  // today.com/almanac — fetched 2026-07-08; ET/PT times converted):
  //   Full:  Jan 3 10:02, Feb 1 22:09 (5:09pm ET), Mar 3 11:38 (6:38am ET),
  //          Apr 2 02:12 (Apr 1 10:12pm ET), May 1 17:23 (1:23pm ET),
  //          May 31 (blue moon — 2nd May full moon)
  //   New:   Mar 19 01:23 (Mar 18 6:23pm PDT), Jan 18 19:52 (11:52am PST)
  const byQuarter = new Map<number, string[]>(); // quarter -> "YYYY-MM-DDTHH:MM"
  let mq = SearchMoonQuarter(new Date(Date.UTC(2026, 0, 1)));
  while (mq.time.date.getUTCFullYear() === 2026) {
    const stamp = mq.time.date.toISOString().slice(0, 16);
    const arr = byQuarter.get(mq.quarter) ?? [];
    arr.push(stamp);
    byQuarter.set(mq.quarter, arr);
    mq = NextMoonQuarter(mq);
  }
  const fulls = byQuarter.get(2) ?? [];
  const news = byQuarter.get(0) ?? [];
  const closeTo = (list: string[], stamp: string) =>
    list.some((s) => Math.abs(new Date(s + "Z").getTime() - new Date(stamp + "Z").getTime()) <= 5 * 60_000);

  it("matches 7 published anchors within 5 minutes", () => {
    expect(closeTo(fulls, "2026-01-03T10:02")).toBe(true);
    expect(closeTo(fulls, "2026-02-01T22:09")).toBe(true);
    expect(closeTo(fulls, "2026-03-03T11:38")).toBe(true);
    expect(closeTo(fulls, "2026-04-02T02:12")).toBe(true);
    expect(closeTo(fulls, "2026-05-01T17:23")).toBe(true);
    expect(fulls.filter((s) => s.startsWith("2026-05-")).length).toBe(2); // blue moon May 31
    expect(closeTo(news, "2026-03-19T01:23")).toBe(true);
    expect(closeTo(news, "2026-01-18T19:52")).toBe(true);
  });

  it("yields a sane number of principal phases (49–51 per year)", () => {
    const total = [...byQuarter.values()].reduce((n, a) => n + a.length, 0);
    expect(total).toBeGreaterThanOrEqual(49);
    expect(total).toBeLessThanOrEqual(51);
  });

  it("moonPhasesForYear maps a phase per event on local dates", () => {
    const map = moonPhasesForYear(2026);
    expect(map.size).toBeGreaterThanOrEqual(48);
    for (const mark of map.values()) {
      expect([0, 1, 2, 3]).toContain(mark.quarter);
      expect(mark.glyph.length).toBeGreaterThan(0);
    }
  });
});
