"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import {
  addSideButton,
  deleteSideButton,
  gradientFrom,
  moveSideButton,
  updateSideButton,
} from "@/lib/planner/sideButtons";
import { SECTIONS } from "@/lib/planner/constants";

/**
 * Editor for the right-edge jump buttons. Lives in two places (Jo r12): the
 * Settings accordion, and a popover hung off the sidebar's ＋ button so she
 * never has to open Settings just to add one.
 */
export default function SideButtonEditor({ plannerId }: { plannerId: string }) {
  const sideButtons = useLiveQuery(
    () => db.sideButtons.where("plannerId").equals(plannerId).sortBy("order"),
    [plannerId]
  );
  // jump-target choices: current week, the fixed sections, plus every custom
  // titled page Jo has added
  const customPages = useLiveQuery(
    () =>
      db.pages
        .where("plannerId").equals(plannerId)
        .and((p) => p.type === "section" && p.meta.sectionKey === "custom")
        .sortBy("index"),
    [plannerId]
  );

  return (
    <>
      <p className="mb-1 text-xs text-slate-500">
        The jump buttons on the right edge — reorder, recolor, change the letter, or point
        one at any page you&apos;ve added. (Emoji print as a letter in PDFs.)
      </p>
      <div className="mb-2 space-y-1" data-side-button-editor>
        {(sideButtons ?? []).map((b, i) => (
          <div key={b.id} className="flex items-center gap-1.5" data-side-button-row={b.id}>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/60 text-sm font-extrabold text-black shadow"
              style={{ background: gradientFrom(b.colorHex) }}
            >
              {b.glyph}
            </span>
            {/* defaultValue + onBlur, like habit/category names: a controlled
                input racing the async liveQuery echo drops keystrokes */}
            <input
              key={`g-${b.id}`}
              defaultValue={b.glyph}
              maxLength={2}
              data-side-input="glyph"
              title="Letter or symbol on the button"
              onBlur={(e) => void updateSideButton(b.id, { glyph: e.target.value })}
              className="w-10 rounded border border-slate-300 px-1 py-0.5 text-center text-sm"
            />
            <input
              key={`l-${b.id}`}
              defaultValue={b.label}
              data-side-input="label"
              title="Name (shown when holding over the button)"
              onBlur={(e) => void updateSideButton(b.id, { label: e.target.value })}
              className="w-0 min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
            />
            <input
              type="color"
              value={b.colorHex}
              data-side-input="color"
              onChange={(e) => void updateSideButton(b.id, { colorHex: e.target.value })}
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-slate-300"
            />
            <select
              value={b.target}
              data-side-input="target"
              title="Where the button jumps"
              onChange={(e) => void updateSideButton(b.id, { target: e.target.value })}
              className="w-28 shrink-0 rounded border border-slate-300 px-1 py-0.5 text-xs"
            >
              <option value="current-week">Current week</option>
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
              {(customPages ?? []).map((p) => (
                <option key={p.id} value={`page:${p.id}`}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              data-side-action="up"
              disabled={i === 0}
              title="Move up"
              onClick={() => void moveSideButton(plannerId, b.id, -1)}
              className="rounded px-1 text-sm hover:bg-slate-100 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              data-side-action="down"
              disabled={i === (sideButtons?.length ?? 0) - 1}
              title="Move down"
              onClick={() => void moveSideButton(plannerId, b.id, 1)}
              className="rounded px-1 text-sm hover:bg-slate-100 disabled:opacity-30"
            >
              ▼
            </button>
            <button
              data-side-action="delete"
              title="Remove this button"
              onClick={() => void deleteSideButton(b.id)}
              className="rounded px-1 text-sm text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        data-side-action="add"
        onClick={() => void addSideButton(plannerId)}
        className="mb-1 rounded bg-slate-700 px-3 py-1 text-sm font-semibold text-white"
      >
        ＋ Add side button
      </button>
    </>
  );
}
