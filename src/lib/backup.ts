import { db } from "@/lib/db/db";
import type { Block } from "@/lib/db/types";

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

export async function createBackup(): Promise<Blob> {
  const [planners, pages, strokes, blocks, habits, habitChecks, categories, events] =
    await Promise.all([
      db.planners.toArray(),
      db.pages.toArray(),
      db.strokes.toArray(),
      db.blocks.toArray(),
      db.habits.toArray(),
      db.habitChecks.toArray(),
      db.categories.toArray(),
      db.events.toArray(),
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

  const payload: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      planners, pages, strokes,
      blocks: serializedBlocks,
      habits, habitChecks, categories, events,
    },
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

export interface RestoreResult {
  restored: Record<string, number>;
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

  const restored: Record<string, number> = {};
  await db.transaction(
    "rw",
    [db.planners, db.pages, db.strokes, db.blocks, db.habits, db.habitChecks, db.categories, db.events],
    async () => {
      const put = async (name: string, table: { bulkPut(rows: never[]): Promise<unknown> }, rows: unknown[]) => {
        await table.bulkPut(rows as never[]);
        restored[name] = rows.length;
      };
      await put("planners", db.planners, data.tables.planners ?? []);
      await put("pages", db.pages, data.tables.pages ?? []);
      await put("strokes", db.strokes, data.tables.strokes ?? []);
      await put("blocks", db.blocks, blocks);
      await put("habits", db.habits, data.tables.habits ?? []);
      await put("habitChecks", db.habitChecks, data.tables.habitChecks ?? []);
      await put("categories", db.categories, data.tables.categories ?? []);
      await put("events", db.events, data.tables.events ?? []);
    }
  );
  return { restored };
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
