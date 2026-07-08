import { toISO } from "@/lib/planner/dates";

/**
 * Gate A default: US federal holidays + common observances, computed (not
 * hardcoded) so the generator is perpetual. Extend HOLIDAY_RULES to add
 * religious/custom dates later.
 */

/** nth (1-based) occurrence of a weekday (Sun=0…Sat=6) in a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Last occurrence of a weekday in a month. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month + 1, 0 - offset);
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher computus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

const HOLIDAY_RULES: { name: string; date: (year: number) => Date }[] = [
  { name: "New Year's Day", date: (y) => new Date(y, 0, 1) },
  { name: "MLK Day", date: (y) => nthWeekday(y, 0, 1, 3) },
  { name: "Valentine's Day", date: (y) => new Date(y, 1, 14) },
  { name: "Presidents' Day", date: (y) => nthWeekday(y, 1, 1, 3) },
  { name: "St. Patrick's Day", date: (y) => new Date(y, 2, 17) },
  { name: "Good Friday", date: (y) => { const e = easterSunday(y); e.setDate(e.getDate() - 2); return e; } },
  { name: "Easter", date: easterSunday },
  { name: "Mother's Day", date: (y) => nthWeekday(y, 4, 0, 2) },
  { name: "Memorial Day", date: (y) => lastWeekday(y, 4, 1) },
  { name: "Father's Day", date: (y) => nthWeekday(y, 5, 0, 3) },
  { name: "Juneteenth", date: (y) => new Date(y, 5, 19) },
  { name: "Independence Day", date: (y) => new Date(y, 6, 4) },
  { name: "Labor Day", date: (y) => nthWeekday(y, 8, 1, 1) },
  { name: "Indigenous Peoples' Day", date: (y) => nthWeekday(y, 9, 1, 2) },
  { name: "Halloween", date: (y) => new Date(y, 9, 31) },
  { name: "Veterans Day", date: (y) => new Date(y, 10, 11) },
  { name: "Thanksgiving", date: (y) => nthWeekday(y, 10, 4, 4) },
  { name: "Christmas Eve", date: (y) => new Date(y, 11, 24) },
  { name: "Christmas", date: (y) => new Date(y, 11, 25) },
  { name: "New Year's Eve", date: (y) => new Date(y, 11, 31) },
];

const cache = new Map<number, Map<string, string[]>>();

/** ISO date → holiday names for every holiday in `year` (memoized). */
export function holidaysForYear(year: number): Map<string, string[]> {
  let map = cache.get(year);
  if (map) return map;
  map = new Map();
  for (const rule of HOLIDAY_RULES) {
    const iso = toISO(rule.date(year));
    const list = map.get(iso) ?? [];
    list.push(rule.name);
    map.set(iso, list);
  }
  cache.set(year, map);
  return map;
}
