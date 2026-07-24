import { getSilentAccessToken } from "./auth";
import { importYear, type ImportResult } from "./import";

/**
 * Scheduled Google sync (Tim: "so we don't have to push the button").
 * A periodic check runs while the app is open; when the chosen interval has
 * elapsed it re-imports using a silent token (cached session token, or a
 * background refresh that needs no clicks). If no token can be had silently,
 * it simply tries again later — the manual button always remains.
 */

export type AutoSyncInterval = "off" | "1h" | "12h" | "24h";

const INTERVAL_KEY = "jotter.autoSync";
const LAST_KEY = "jotter.lastAutoSync"; // per planner: `${LAST_KEY}.<plannerId>`

export const AUTO_SYNC_MS: Record<Exclude<AutoSyncInterval, "off">, number> = {
  "1h": 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

export function getAutoSyncInterval(): AutoSyncInterval {
  try {
    const v = localStorage.getItem(INTERVAL_KEY);
    return v === "1h" || v === "12h" || v === "24h" ? v : "off";
  } catch {
    return "off";
  }
}

export function setAutoSyncInterval(v: AutoSyncInterval) {
  localStorage.setItem(INTERVAL_KEY, v);
}

export function lastAutoSyncAt(plannerId: string): number | null {
  const v = Number(localStorage.getItem(`${LAST_KEY}.${plannerId}`) ?? "0");
  return v > 0 ? v : null;
}

/** Pure gate: is a sync due? (unit-tested) */
export function autoSyncDue(
  interval: AutoSyncInterval,
  lastAt: number | null,
  now: number
): boolean {
  if (interval === "off") return false;
  if (lastAt === null) return true;
  return now - lastAt >= AUTO_SYNC_MS[interval];
}

const listeners = new Set<(r: ImportResult, at: number) => void>();

/** Subscribe (e.g. the settings panel) to background sync completions. */
export function onAutoSync(fn: (r: ImportResult, at: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let running = false;

/** Called on an interval by the shell; quietly does nothing until due. */
export async function maybeAutoSync(
  plannerId: string,
  year: number
): Promise<"synced" | "not-due" | "no-token" | "error" | "busy"> {
  if (running) return "busy";
  if (!autoSyncDue(getAutoSyncInterval(), lastAutoSyncAt(plannerId), Date.now())) {
    return "not-due";
  }
  const token = await getSilentAccessToken();
  if (!token) return "no-token"; // try again on a later tick
  running = true;
  try {
    const result = await importYear(plannerId, year, token);
    const at = Date.now();
    localStorage.setItem(`${LAST_KEY}.${plannerId}`, String(at));
    listeners.forEach((fn) => fn(result, at));
    return "synced";
  } catch {
    return "error"; // transient (offline etc.) — next tick retries
  } finally {
    running = false;
  }
}

/** Manual syncs also reset the clock so auto-sync doesn't double up. */
export function recordManualSync(plannerId: string) {
  localStorage.setItem(`${LAST_KEY}.${plannerId}`, String(Date.now()));
}
