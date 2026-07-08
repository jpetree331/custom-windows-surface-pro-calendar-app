import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/db";
import { findDriveBackup, uploadDriveBackup, downloadDriveBackup, BACKUP_FILENAME } from "./drive";
import { autoDriveBackup } from "@/lib/backup-auto";
import type { FetchLike } from "./api";

/** Minimal in-memory Drive appDataFolder. */
function fakeDrive() {
  const store: { id: string; name: string; content: string; modifiedTime: string }[] = [];
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.split("?")[0]}`);
    const blobText = async () =>
      typeof init.body === "string" ? init.body : await new Response(init.body as Blob).text();

    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      return Response.json({ files: store.map(({ id, modifiedTime }) => ({ id, modifiedTime })) });
    }
    if (url.includes("/upload/drive/v3/files?uploadType=multipart")) {
      const raw = await blobText();
      const content = raw.split("\r\n\r\n")[2]?.split("\r\n--")[0] ?? "";
      const f = { id: `f${store.length + 1}`, name: BACKUP_FILENAME, content, modifiedTime: "2026-07-08T12:00:00Z" };
      store.push(f);
      return Response.json({ id: f.id });
    }
    const patch = url.match(/\/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (patch) {
      const f = store.find((s) => s.id === patch[1])!;
      f.content = await blobText();
      f.modifiedTime = "2026-07-08T13:00:00Z";
      return Response.json({ id: f.id });
    }
    const media = url.match(/\/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (media) {
      return new Response(store.find((s) => s.id === media[1])!.content);
    }
    return new Response("not found", { status: 404 });
  };
  return { store, calls, fetchImpl };
}

// Node has no localStorage; backup-auto only needs get/set/clear.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
});

describe("Drive backup client", () => {
  it("creates on first upload, updates (not duplicates) on the second", async () => {
    const drive = fakeDrive();
    expect(await findDriveBackup("t", drive.fetchImpl)).toBeNull();
    await uploadDriveBackup("t", new Blob([`{"v":1}`]), drive.fetchImpl);
    expect(drive.store).toHaveLength(1);
    await uploadDriveBackup("t", new Blob([`{"v":2}`]), drive.fetchImpl);
    expect(drive.store).toHaveLength(1); // updated in place
    expect(drive.store[0].content).toBe(`{"v":2}`);
    const dl = await downloadDriveBackup("t", drive.fetchImpl);
    expect(dl?.json).toBe(`{"v":2}`);
  });
});

describe("autoDriveBackup gating", () => {
  it("skips without a token, skips when clean, uploads when dirty, throttles repeats", async () => {
    const drive = fakeDrive();
    expect(await autoDriveBackup({ token: null })).toBe("no-token");

    // clean db (no queued changes at all)
    expect(await autoDriveBackup({ token: "t", fetchImpl: drive.fetchImpl })).toBe("clean");

    // dirty → uploads
    await db.syncQueue.add({ table: "strokes", rowId: "s1", op: "put", ts: 1 });
    expect(await autoDriveBackup({ token: "t", fetchImpl: drive.fetchImpl, now: 10_000_000 })).toBe("done");
    expect(drive.store).toHaveLength(1);

    // same seq again → clean
    expect(await autoDriveBackup({ token: "t", fetchImpl: drive.fetchImpl, now: 10_000_001 })).toBe("clean");

    // new change immediately → throttled
    await db.syncQueue.add({ table: "strokes", rowId: "s2", op: "put", ts: 2 });
    expect(await autoDriveBackup({ token: "t", fetchImpl: drive.fetchImpl, now: 10_060_000 })).toBe("too-soon");

    // after >5 min → uploads again
    expect(await autoDriveBackup({ token: "t", fetchImpl: drive.fetchImpl, now: 10_000_000 + 6 * 60_000 })).toBe("done");
  });
});
