import { db } from "@/lib/db/db";
import type { Asset, Block } from "@/lib/db/types";
import { purgeMoonPhaseDuplicates } from "@/lib/google/import";
import { clearPathCache } from "@/lib/ink/render";
import { queueSync } from "@/lib/sync";

/**
 * Full-planner backup: every table serialized to one JSON file (image blobs
 * base64-encoded). Restore upserts by id, so importing an old backup never
 * deletes newer work — it only fills in whatever is missing.
 */

const FORMAT = "jotter-backup";
const VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type SerializedBlock = Omit<Block, "imageBlob"> & {
  imageB64?: string;
  imageType?: string;
};
type SerializedAsset = Omit<Asset, "blob"> & { b64: string; type: string };

export async function createBackup(): Promise<Blob> {
  const [planners, pages, strokes, blocks, habits, habitChecks, categories, events, sideButtons, notes, assets] =
    await Promise.all([
      db.planners.toArray(),
      db.pages.toArray(),
      db.strokes.toArray(),
      db.blocks.toArray(),
      db.habits.toArray(),
      db.habitChecks.toArray(),
      db.categories.toArray(),
      db.events.toArray(),
      db.sideButtons.toArray(),
      db.notes.toArray(),
      db.assets.toArray(),
    ]);

  const serializedBlocks: SerializedBlock[] = await Promise.all(
    blocks.map(async (b) => {
      const { imageBlob, ...rest } = b;
      if (!imageBlob) return rest;
      return {
        ...rest,
        imageB64: bytesToBase64(new Uint8Array(await imageBlob.arrayBuffer())),
        imageType: imageBlob.type || "image/png",
      };
    })
  );
  const serializedAssets: SerializedAsset[] = await Promise.all(
    assets.map(async (a) => {
      const { blob, ...rest } = a;
      return {
        ...rest,
        b64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
        type: blob.type || "image/jpeg",
      };
    })
  );

  const payload: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      planners, pages, strokes,
      blocks: serializedBlocks,
      habits, habitChecks, categories, events,
      // note ink/text rides along in strokes/blocks (pageId = note id)
      sideButtons, notes,
      assets: serializedAssets,
    },
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

export interface RestoreResult {
  restored: Record<string, number>;
  /** Rows the backup carried that were OLDER than what this device already
   *  had — left alone, so a restore can never roll back recent work. */
  kept: number;
}

/** Tables whose rows carry updatedAt, so a restore can compare recency. */
const STAMPED = new Set(["planners", "pages", "blocks", "events", "notes", "assets"]);

interface MergeTable {
  bulkGet(keys: string[]): Promise<(unknown | undefined)[]>;
  bulkPut(rows: never[]): Promise<unknown>;
}

/**
 * Upsert by id, but where both sides carry updatedAt the newer one wins:
 * bulkPut alone would have overwritten a text box edited five minutes ago
 * with its state at backup time — the opposite of the "never erases newer
 * work" promise the Backup panel makes. Tables without a timestamp (ink,
 * habits, checks) still upsert as before.
 */
async function mergeRows(
  name: string,
  table: MergeTable,
  rows: unknown[]
): Promise<{ written: number; kept: number }> {
  if (!STAMPED.has(name)) {
    await table.bulkPut(rows as never[]);
    return { written: rows.length, kept: 0 };
  }
  const stamped = rows as { id: string; updatedAt?: number }[];
  const existing = (await table.bulkGet(stamped.map((r) => r.id))) as
    ({ updatedAt?: number } | undefined)[];
  const fresh = stamped.filter((r, i) => {
    const cur = existing[i];
    return !(
      cur &&
      typeof cur.updatedAt === "number" &&
      typeof r.updatedAt === "number" &&
      cur.updatedAt > r.updatedAt
    );
  });
  await table.bulkPut(fresh as never[]);
  return { written: fresh.length, kept: rows.length - fresh.length };
}

/**
 * Restoring a backup taken BEFORE a page was deleted brings that page back
 * with its old index — which another page now occupies. Renumber each
 * planner's pages 0…n-1 (stable on index, then age) so the feed order is
 * unambiguous again.
 */
async function normalizePageIndexes() {
  for (const p of await db.planners.toArray()) {
    const pages = await db.pages.where("plannerId").equals(p.id).toArray();
    pages.sort((a, b) => a.index - b.index || a.updatedAt - b.updatedAt);
    await db.transaction("rw", db.pages, async () => {
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].index !== i) await db.pages.update(pages[i].id, { index: i });
      }
    });
  }
}

export async function restoreBackup(json: string): Promise<RestoreResult> {
  const data = JSON.parse(json) as BackupFile;
  if (data.format !== FORMAT || typeof data.version !== "number") {
    throw new Error("Not a Jo's Planner backup file.");
  }
  if (data.version > VERSION) {
    throw new Error(`Backup is from a newer app version (${data.version}).`);
  }

  const blocks: Block[] = ((data.tables.blocks ?? []) as SerializedBlock[]).map((b) => {
    const { imageB64, imageType, ...rest } = b;
    return imageB64
      ? { ...rest, imageBlob: new Blob([base64ToBytes(imageB64) as BlobPart], { type: imageType }) }
      : rest;
  });

  const assets: Asset[] = ((data.tables.assets ?? []) as SerializedAsset[]).map((a) => {
    const { b64, type, ...rest } = a;
    return { ...rest, blob: new Blob([base64ToBytes(b64) as BlobPart], { type }) };
  });

  const restored: Record<string, number> = {};
  let kept = 0;
  await db.transaction(
    "rw",
    [db.planners, db.pages, db.strokes, db.blocks, db.habits, db.habitChecks, db.categories, db.events, db.sideButtons, db.notes, db.assets],
    async () => {
      const put = async (name: string, table: MergeTable, rows: unknown[]) => {
        const r = await mergeRows(name, table, rows);
        restored[name] = r.written;
        kept += r.kept;
      };
      await put("planners", db.planners, data.tables.planners ?? []);
      await put("pages", db.pages, data.tables.pages ?? []);
      await put("strokes", db.strokes, data.tables.strokes ?? []);
      await put("blocks", db.blocks, blocks);
      await put("habits", db.habits, data.tables.habits ?? []);
      await put("habitChecks", db.habitChecks, data.tables.habitChecks ?? []);
      await put("categories", db.categories, data.tables.categories ?? []);
      await put("events", db.events, data.tables.events ?? []);
      // absent in pre-round-9 backups — degrades to a no-op
      await put("sideButtons", db.sideButtons, data.tables.sideButtons ?? []);
      await put("notes", db.notes, data.tables.notes ?? []);
      await put("assets", db.assets, assets); // absent before r15 — no-op
    }
  );
  await normalizePageIndexes();
  // Mark the database dirty, or the silent Drive backup would see a "clean"
  // queue and skip everything a restore just brought in. The queue is a
  // dirty flag (see backup-auto.ts), so one row per touched table is enough.
  for (const [name, n] of Object.entries(restored)) {
    if (n > 0) await queueSync(name, "*restore*", "put");
  }
  // Restored strokes may share ids with cached outlines from before (a stroke
  // moved locally, then restored to its old spot) — never draw the stale one.
  clearPathCache();
  // A snapshot taken before Jo unsubscribed would otherwise re-import her
  // moon-phase chips wholesale (Jo r12).
  for (const p of await db.planners.toArray()) await purgeMoonPhaseDuplicates(p.id);
  return { restored, kept };
}

/**
 * Ask the browser to protect this origin's storage from automatic eviction
 * under disk pressure. Usually auto-granted for installed PWAs.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
