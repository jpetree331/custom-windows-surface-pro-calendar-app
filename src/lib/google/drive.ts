/**
 * Google Drive appDataFolder client — the planner's cloud backup slot in Jo's
 * OWN Google account. The drive.appdata scope only exposes files this app
 * created; the rest of her Drive is invisible to us.
 * Endpoints verified against developers.google.com/workspace/drive/api/reference (2026-07-08).
 * `fetchImpl` is injectable for tests (same pattern as api.ts).
 */

import type { FetchLike } from "./api";

const META = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export const BACKUP_FILENAME = "jotter-backup.json";

export interface DriveBackupInfo {
  id: string;
  modifiedTime: string;
  size?: string;
}

async function assertOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${await res.text()}`);
  return res;
}

/** Metadata of the existing backup file, or null if none exists yet. */
export async function findDriveBackup(
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<DriveBackupInfo | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${BACKUP_FILENAME}'`,
    fields: "files(id, modifiedTime, size)",
  });
  const res = await assertOk(
    await fetchImpl(`${META}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
  const data = (await res.json()) as { files?: DriveBackupInfo[] };
  return data.files?.[0] ?? null;
}

/** Create or overwrite the backup file. Returns the file id. */
export async function uploadDriveBackup(
  token: string,
  backup: Blob,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const existing = await findDriveBackup(token, fetchImpl);
  if (existing) {
    await assertOk(
      await fetchImpl(`${UPLOAD}/${existing.id}?uploadType=media`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: backup,
      })
    );
    return existing.id;
  }
  const boundary = "jotter-backup-boundary";
  const metadata = JSON.stringify({ name: BACKUP_FILENAME, parents: ["appDataFolder"] });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      backup,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );
  const res = await assertOk(
    await fetchImpl(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  );
  return ((await res.json()) as { id: string }).id;
}

/** Download the backup file's JSON text, or null if no backup exists. */
export async function downloadDriveBackup(
  token: string,
  fetchImpl: FetchLike = fetch
): Promise<{ json: string; modifiedTime: string } | null> {
  const existing = await findDriveBackup(token, fetchImpl);
  if (!existing) return null;
  const res = await assertOk(
    await fetchImpl(`${META}/${existing.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
  return { json: await res.text(), modifiedTime: existing.modifiedTime };
}
