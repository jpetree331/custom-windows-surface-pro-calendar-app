import { db } from "@/lib/db/db";

/**
 * "Save to MY folder": the File System Access API lets the user pick a folder
 * once; the handle is stored in IndexedDB and reused for every backup/PDF.
 * Falls back to a normal browser download when unsupported (Firefox), no
 * folder chosen yet, or permission is refused.
 */

const KV_KEY = "saveFolderHandle";

interface DirHandle {
  readonly name: string;
  queryPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
  getFileHandle(name: string, opts: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

declare global {
  interface Window {
    showDirectoryPicker?(opts?: { mode?: "readwrite" }): Promise<DirHandle>;
  }
}

export function folderPickingSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Ask the user to pick a folder; remember it. Returns its name, or null. */
export async function chooseSaveFolder(): Promise<string | null> {
  if (!folderPickingSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ mode: "readwrite" });
    await db.kv.put({ key: KV_KEY, value: handle });
    return handle.name;
  } catch {
    return null; // user cancelled the picker
  }
}

export async function getSaveFolderName(): Promise<string | null> {
  const row = await db.kv.get(KV_KEY).catch(() => undefined);
  const handle = row?.value as DirHandle | undefined;
  return handle?.name ?? null;
}

export async function clearSaveFolder() {
  await db.kv.delete(KV_KEY);
}

async function storedHandleWithPermission(): Promise<DirHandle | null> {
  const row = await db.kv.get(KV_KEY).catch(() => undefined);
  const handle = row?.value as DirHandle | undefined;
  if (!handle) return null;
  try {
    if ((await handle.queryPermission?.({ mode: "readwrite" })) === "granted") return handle;
    // re-ask (we're always inside a user gesture: a Save/Export button click)
    if ((await handle.requestPermission?.({ mode: "readwrite" })) === "granted") return handle;
  } catch {
    // folder deleted/moved — fall through to download
  }
  return null;
}

/** Save into the chosen folder if possible, else classic browser download. */
export async function saveFile(
  filename: string,
  blob: Blob
): Promise<{ mode: "folder" | "download"; folder?: string }> {
  const handle = await storedHandleWithPermission();
  if (handle) {
    try {
      const file = await handle.getFileHandle(filename, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      return { mode: "folder", folder: handle.name };
    } catch {
      // write failed (drive detached etc.) — fall back to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { mode: "download" };
}
