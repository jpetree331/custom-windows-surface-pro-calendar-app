"use client";

import { useEffect, useRef, useState } from "react";
import { createBackup, restoreBackup, ensurePersistentStorage } from "@/lib/backup";
import { lastDriveBackupAt, recordDriveBackup } from "@/lib/backup-auto";
import { getAccessToken, googleClientId } from "@/lib/google/auth";
import { downloadDriveBackup, uploadDriveBackup } from "@/lib/google/drive";

/** Backup / restore section of the settings dialog. */
export default function BackupPanel() {
  const [status, setStatus] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [driveAt, setDriveAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ensurePersistentStorage().then(setPersisted);
    setDriveAt(lastDriveBackupAt());
  }, []);

  const driveBackupNow = async () => {
    try {
      setStatus("Backing up to Google Drive…");
      const token = await getAccessToken();
      const blob = await createBackup();
      await uploadDriveBackup(token, blob);
      await recordDriveBackup();
      setDriveAt(lastDriveBackupAt());
      setStatus("Backed up to the app folder in Jo's Google Drive ✔ (auto-backup keeps it fresh from now on)");
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    }
  };

  const driveRestore = async () => {
    try {
      setStatus("Looking for a Drive backup…");
      const token = await getAccessToken();
      const found = await downloadDriveBackup(token);
      if (!found) {
        setStatus("No Drive backup found for this Google account yet.");
        return;
      }
      const { restored } = await restoreBackup(found.json);
      const total = Object.values(restored).reduce((a, b) => a + b, 0);
      setStatus(
        `Restored ${total} items from the Drive backup of ${new Date(found.modifiedTime).toLocaleString()}. Newer local work was kept.`
      );
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    }
  };

  const download = async () => {
    try {
      const blob = await createBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jos-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus(`Backup downloaded (${(blob.size / 1024 / 1024).toFixed(1)} MB). Keep it in OneDrive or Downloads.`);
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    }
  };

  const restore = async (file: File) => {
    try {
      const { restored } = await restoreBackup(await file.text());
      const total = Object.values(restored).reduce((a, b) => a + b, 0);
      setStatus(`Restored ${total} items (${restored.strokes} strokes, ${restored.blocks} blocks). Existing newer work was kept.`);
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-3" data-backup-panel>
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Backup</h3>
      <p className="mb-2 text-xs text-slate-500">
        Everything lives on this device. Download a backup file now and then —
        it restores ink, notes, habits, and images onto any device.
        {persisted !== null && (
          <span data-persist-status>
            {" "}Storage protection: {persisted ? "✔ persistent (won't be auto-evicted)" : "⚠ not granted — install as an app to secure it"}.
          </span>
        )}
      </p>
      {status && <p className="mb-2 text-xs font-medium text-slate-700" data-backup-status>{status}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void download()}
          data-action="backup-download"
          className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
        >
          Download backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          data-action="backup-restore"
          className="rounded border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Restore from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = "";
          }}
        />
      </div>
      {googleClientId() && (
        <div className="mt-3" data-drive-backup>
          <p className="mb-2 text-xs text-slate-500">
            <span className="font-semibold">Google Drive:</span> once connected, the app
            auto-backs-up to a hidden app folder in Jo&apos;s own Drive every few
            minutes of use — it can only see its own file, nothing else in her Drive.
            {driveAt && (
              <span data-drive-status> Last Drive backup: {new Date(driveAt).toLocaleString()}.</span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void driveBackupNow()}
              data-action="drive-backup"
              className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white"
            >
              Back up to Drive now
            </button>
            <button
              onClick={() => void driveRestore()}
              data-action="drive-restore"
              className="rounded border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Restore from Drive…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
