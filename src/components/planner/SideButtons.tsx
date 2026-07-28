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
  onOpenSettings,
}: {
  plannerId: string;
  onJump: (target: string) => void;
  /** Opens the Notes menu anchored beside the 🗒 button (hover or tap). */
  onOpenNotepad: (anchor: { top: number; right: number }) => void;
  /** Right-click anywhere on the column → its settings section (Jo). */
  onOpenSettings: () => void;
}) {
  const buttons =
    useLiveQuery(
      () => db.sideButtons.where("plannerId").equals(plannerId).sortBy("order"),
      [plannerId]
    ) ?? [];
  const notepadAnchor = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, right: window.innerWidth - r.left + 8 };
  };
  return (
    <div
      className="pointer-events-none absolute right-1 top-12 z-20 flex flex-col gap-1.5 print:hidden"
      style={{ touchAction: "manipulation" }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenSettings();
      }}
    >
      {/* invisible backing rect: the container is pointer-events-none, so a
          right-click in the small gaps BETWEEN buttons would fall through to
          the page and open the wrong menu. Buttons are `relative`, painting
          above it, so left-click/pen behavior on them is unchanged. */}
      <div
        className="pointer-events-auto absolute inset-0"
        data-side-button-backdrop
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenSettings();
        }}
      />
      {buttons.map((b) => (
        <button
          key={b.id}
          data-side-button={b.id}
          title={b.label}
          onClick={() => onJump(b.target)}
          className="pointer-events-auto relative flex h-9 w-9 items-center justify-center rounded-md border border-white/60 text-lg font-extrabold text-black shadow-md active:scale-95"
          style={{ background: gradientFrom(b.colorHex) }}
        >
          {b.glyph}
        </button>
      ))}
      <button
        data-side-button="notepad"
        title="Notepad — floating notes you can type or write in"
        onClick={(e) => onOpenNotepad(notepadAnchor(e.currentTarget))}
        // hover opens the menu too (Jo) — pen hover fires pointerenter
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") onOpenNotepad(notepadAnchor(e.currentTarget));
        }}
        className="pointer-events-auto relative mt-1 flex h-9 w-9 items-center justify-center rounded-md border border-white/60 bg-slate-700 text-lg text-white shadow-md active:scale-95"
      >
        🗒
      </button>
    </div>
  );
}
