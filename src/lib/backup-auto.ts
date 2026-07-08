import { db } from "@/lib/db/db";
import { createBackup } from "@/lib/backup";
import { cachedToken } from "@/lib/google/auth";
import { uploadDriveBackup } from "@/lib/google/drive";
import type { FetchLike } from "@/lib/google/api";

/**
 * Silent Drive auto-backup. Runs opportunistically (interval + page-hide):
 * uploads only when there are new changes, a Google token is already cached
 * (never pops a login), and the last upload is >5 min old.
 */

const SEQ_KEY = "jotter.driveBackup.seq";
const TIME_KEY = "jotter.driveBackup.at";
const MIN_INTERVAL_MS = 5 * 60_000;

export type AutoBackupResult = "done" | "no-token" | "clean" | "too-soon" | "error";

export async function autoDriveBackup(opts?: {
  token?: string | null;
  fetchImpl?: FetchLike;
  now?: number;
}): Promise<AutoBackupResult> {
  const token = opts?.token !== undefined ? opts.token : cachedToken();
  if (!token) return "no-token";

  const last = await db.syncQueue.toCollection().last();
  const lastSeq = last?.seq ?? 0;
  const doneSeq = Number(localStorage.getItem(SEQ_KEY) ?? "-1");
  // lastSeq === 0: nothing was ever written on this device — never auto-upload
  // (a fresh install must not clobber a good Drive backup before restore).
  if (lastSeq === 0 || lastSeq === doneSeq) return "clean";

  const now = opts?.now ?? Date.now();
  const lastAt = Number(localStorage.getItem(TIME_KEY) ?? "0");
  if (now - lastAt < MIN_INTERVAL_MS) return "too-soon";

  try {
    const blob = await createBackup();
    await uploadDriveBackup(token, blob, opts?.fetchImpl ?? fetch);
    localStorage.setItem(SEQ_KEY, String(lastSeq));
    localStorage.setItem(TIME_KEY, String(now));
    return "done";
  } catch (err) {
    console.warn("Drive auto-backup failed:", err);
    return "error";
  }
}

/** Timestamp of the last successful Drive upload from this device, if any. */
export function lastDriveBackupAt(): number | null {
  const v = Number(localStorage.getItem(TIME_KEY) ?? "0");
  return v > 0 ? v : null;
}

/** Mark a manual upload so the auto-backup doesn't immediately re-upload. */
export async function recordDriveBackup(now = Date.now()) {
  const last = await db.syncQueue.toCollection().last();
  localStorage.setItem(SEQ_KEY, String(last?.seq ?? 0));
  localStorage.setItem(TIME_KEY, String(now));
}
