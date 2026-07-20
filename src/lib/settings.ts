/** Small user preferences (device-local, like the pen palette). */

export type TimeFormat = "12h" | "24h";

const TIME_KEY = "jotter.timeFormat";

export function getTimeFormat(): TimeFormat {
  try {
    return localStorage.getItem(TIME_KEY) === "24h" ? "24h" : "12h";
  } catch {
    return "12h";
  }
}

export function setTimeFormat(f: TimeFormat) {
  localStorage.setItem(TIME_KEY, f);
}

/** "14:00" → "2:00 PM" (or unchanged in 24h mode). */
export function formatTime(hhmm: string | undefined, format?: TimeFormat): string | undefined {
  if (!hhmm) return hhmm;
  if ((format ?? getTimeFormat()) === "24h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
