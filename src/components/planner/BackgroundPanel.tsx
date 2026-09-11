"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import {
  backgroundStrengthOf,
  clearBackground,
  setBackground,
  setBackgroundStrength,
} from "@/lib/background";
import { usePlannerUI } from "./ui-context";

/** Settings → Background: pick a picture for every page of this year (Jo r15). */
export default function BackgroundPanel({ plannerId }: { plannerId: string }) {
  const { background } = usePlannerUI();
  const planner = useLiveQuery(() => db.planners.get(plannerId), [plannerId]);
  const strength = backgroundStrengthOf(planner?.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async (file: File) => {
    setBusy(true);
    try {
      const row = await setBackground(plannerId, file);
      setStatus(`Background set (${(row.blob.size / 1024).toFixed(0)} KB stored).`);
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3" data-background-panel>
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Background</h3>
      <p className="mb-2 text-xs text-slate-500">
        A picture behind every page of this year. Any size works — it&apos;s cropped to
        the page&apos;s shape (portrait, 10:13, like 1000 × 1300); pictures are shrunk to
        at most 2000 × 2600 as they come in, so a phone photo is fine.
      </p>
      <div className="flex items-center gap-3">
        <div
          className="h-16 w-12 shrink-0 overflow-hidden rounded border border-slate-300"
          style={{ background: "linear-gradient(90deg, #d9f5dc 0%, #cdeef2 45%, #a9c6f7 100%)" }}
          data-background-preview
        >
          {background && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={background.url} alt="" className="h-full w-full object-cover" style={{ opacity: background.strength }} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              data-action="background-choose"
              className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Working…" : background ? "Change picture…" : "Choose picture…"}
            </button>
            {background && (
              <button
                onClick={() => void clearBackground(plannerId).then(() => setStatus("Background removed."))}
                data-action="background-remove"
                className="rounded border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Remove
              </button>
            )}
          </div>
          {background && (
            <label className="text-xs text-slate-500">
              Picture strength: {Math.round(strength * 100)}%
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(strength * 100)}
                data-input="background-strength"
                onChange={(e) => void setBackgroundStrength(plannerId, Number(e.target.value) / 100)}
                className="w-full"
              />
            </label>
          )}
        </div>
      </div>
      {status && <p className="mt-1 text-xs font-medium text-slate-700" data-background-status>{status}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-input="background-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choose(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
