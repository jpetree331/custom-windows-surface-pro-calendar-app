"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { gradientFrom } from "@/lib/planner/sideButtons";

/**
 * Right-edge jump buttons — per-planner rows Jo can edit in Settings
 * (add/remove/reorder/recolor/re-glyph). The 🗒 Notepad launcher is a fixed
 * extra, not an editable row: notes are app-global, not a jump target.
 */
export default function SideButtons({
  plannerId,
  onJump,
  onOpenNotepad,
}: {
  plannerId: string;
  onJump: (target: string) => void;
  onOpenNotepad: () => void;
}) {
  const buttons =
    useLiveQuery(
      () => db.sideButtons.where("plannerId").equals(plannerId).sortBy("order"),
      [plannerId]
    ) ?? [];
  return (
    <div
      className="pointer-events-none absolute right-1 top-12 z-20 flex flex-col gap-1.5 print:hidden"
      style={{ touchAction: "manipulation" }}
    >
      {buttons.map((b) => (
        <button
          key={b.id}
          data-side-button={b.id}
          title={b.label}
          onClick={() => onJump(b.target)}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md border border-white/60 text-lg font-extrabold text-black shadow-md active:scale-95"
          style={{ background: gradientFrom(b.colorHex) }}
        >
          {b.glyph}
        </button>
      ))}
      <button
        data-side-button="notepad"
        title="Notepad — floating notes you can type or write in"
        onClick={onOpenNotepad}
        className="pointer-events-auto mt-1 flex h-9 w-9 items-center justify-center rounded-md border border-white/60 bg-slate-700 text-lg text-white shadow-md active:scale-95"
      >
        🗒
      </button>
    </div>
  );
}
