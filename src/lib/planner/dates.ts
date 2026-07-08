/** Date helpers — all local-time, planner weeks start Monday. */

export const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

export const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

export const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Monday of the week containing `d` (weeks run Mon–Sun). */
export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(out, -dow);
}

export interface WeekSpan {
  /** Monday. */
  start: Date;
  /** Sunday. */
  end: Date;
  /** 1-based week number within the planner year. */
  weekNumber: number;
  /** Month (0–11) that owns this week = month of its Thursday (ISO rule). */
  monthIndex: number;
}

/**
 * Every Monday-start week belonging to `year`, ISO-style: a week belongs to
 * the year/month containing its Thursday. 2026 yields 53 weeks.
 */
export function weeksOfYear(year: number): WeekSpan[] {
  const weeks: WeekSpan[] = [];
  // First week: the one whose Thursday is Jan 1..Jan 7.
  let monday = mondayOf(new Date(year, 0, 1));
  if (addDays(monday, 3).getFullYear() < year) monday = addDays(monday, 7);
  let n = 1;
  while (addDays(monday, 3).getFullYear() === year) {
    const thursday = addDays(monday, 3);
    weeks.push({
      start: monday,
      end: addDays(monday, 6),
      weekNumber: n++,
      monthIndex: thursday.getMonth(),
    });
    monday = addDays(monday, 7);
  }
  return weeks;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Day-of-week (Mon=0 … Sun=6) of the 1st of the month. */
export function firstDowOfMonth(year: number, monthIndex: number): number {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
}
