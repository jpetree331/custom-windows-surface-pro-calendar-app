import { SearchMoonQuarter, NextMoonQuarter, type MoonQuarter } from "astronomy-engine";
import { toISO } from "@/lib/planner/dates";

/**
 * Gate A default: the 4 principal phases (new, first quarter, full, last
 * quarter), computed from astronomy-engine's ephemeris. Dates are the LOCAL
 * calendar day of the phase instant on this device.
 */

export const MOON_GLYPHS = ["🌑", "🌓", "🌕", "🌗"] as const;
export const MOON_NAMES = ["New Moon", "First Quarter", "Full Moon", "Last Quarter"] as const;

export interface MoonMark {
  /** 0 new, 1 first quarter, 2 full, 3 last quarter. */
  quarter: 0 | 1 | 2 | 3;
  glyph: string;
  name: string;
}

const cache = new Map<number, Map<string, MoonMark>>();

/** ISO date → principal moon phase occurring that day, for every day in `year`. */
export function moonPhasesForYear(year: number): Map<string, MoonMark> {
  let map = cache.get(year);
  if (map) return map;
  map = new Map();
  let mq: MoonQuarter = SearchMoonQuarter(new Date(year, 0, 1, 0, 0, 0));
  while (mq.time.date.getFullYear() <= year) {
    if (mq.time.date.getFullYear() === year) {
      const q = mq.quarter as 0 | 1 | 2 | 3;
      map.set(toISO(mq.time.date), { quarter: q, glyph: MOON_GLYPHS[q], name: MOON_NAMES[q] });
    }
    mq = NextMoonQuarter(mq);
  }
  cache.set(year, map);
  return map;
}
