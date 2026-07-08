"use client";

import { useEffect, useRef, useState } from "react";
import { createBackup, restoreBackup, ensurePersistentStorage } from "@/lib/backup";

/** Backup / restore section of the settings dialog. */
export default function BackupPanel() {
  const [status, setStatus] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ensurePersistentStorage().then(setPersisted);
  }, []);

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
    </div>
  );
}
