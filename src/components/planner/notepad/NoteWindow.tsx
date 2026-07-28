"use client";

import { useRef, useState } from "react";
import type { Note } from "@/lib/db/types";
import { updateNote } from "@/lib/notes/actions";
import BlocksLayer from "../BlocksLayer";
import InkCanvas from "../InkCanvas";
import FloatingWindow from "./FloatingWindow";

const MAX_ZOOM = 3;

/**
 * One floating note: a real mini planner page (BlocksLayer + InkCanvas keyed
 * by pageId = note.id) filling the whole window — no letterbox (Jo r10).
 * The logical coordinate space is width-based, so a free-aspect page keeps
 * every tool working. Two-finger pinch zooms (1–3×), one finger pans while
 * zoomed; zoom is transient and resets when the note closes.
 */
export default function NoteWindow({
  note,
  derivedTitle,
  onFocus,
}: {
  note: Note;
  derivedTitle: string;
  onFocus: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 }); // pan ≤ 0, fractions
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinchBase = useRef<{ dist: number; zoom: number } | null>(null);

  const clampView = (zoom: number, panX: number, panY: number) => ({
    zoom,
    panX: Math.min(0, Math.max(1 - zoom, panX)),
    panY: Math.min(0, Math.max(1 - zoom, panY)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinchBase.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
    const prev = touches.current.get(e.pointerId)!;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const vp = viewportRef.current?.getBoundingClientRect();
    if (!vp) return;
    if (touches.current.size === 2 && pinchBase.current) {
      const [a, b] = [...touches.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.min(MAX_ZOOM, Math.max(1, (pinchBase.current.zoom * dist) / Math.max(1, pinchBase.current.dist)));
      // zoom around the viewport center: keep the center's page point fixed
      setView((v) => {
        const cx = 0.5 - v.panX; // center in page fractions (of viewport*zoom)
        const cy = 0.5 - v.panY;
        const scaleRatio = zoom / v.zoom;
        return clampView(zoom, 0.5 - cx * scaleRatio, 0.5 - cy * scaleRatio);
      });
    } else if (touches.current.size === 1 && view.zoom > 1) {
      // one-finger pan while zoomed
      setView((v) =>
        clampView(v.zoom, v.panX + (e.clientX - prev.x) / vp.width, v.panY + (e.clientY - prev.y) / vp.height)
      );
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinchBase.current = null;
  };

  return (
    <FloatingWindow
      name={`note-${note.id}`}
      rect={note}
      z={note.z}
      onFocus={onFocus}
      onClose={() => void updateNote(note.id, { open: false })}
      onCommitRect={(r) => void updateNote(note.id, r)}
      title={
        <input
          key={note.id}
          data-note-title={note.id}
          defaultValue={note.title}
          placeholder={derivedTitle}
          // commit on blur (not per keystroke): a controlled input racing the
          // async liveQuery echo drops characters under fast typing
          onBlur={(e) => void updateNote(note.id, { title: e.target.value })}
          className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
        />
      }
    >
      <div
        ref={viewportRef}
        className="relative h-full w-full overflow-hidden rounded-b-lg bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          data-note-page={note.id}
          className="absolute bg-white"
          style={{
            left: `${view.panX * 100}%`,
            top: `${view.panY * 100}%`,
            width: `${view.zoom * 100}%`,
            height: `${view.zoom * 100}%`,
            containerType: "inline-size",
            isolation: "isolate",
          }}
        >
          <BlocksLayer pageId={note.id} defaultFontSize={18} />
          <InkCanvas pageId={note.id} />
        </div>
        {view.zoom > 1 && (
          <button
            data-note-zoom-reset
            onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
            className="absolute bottom-1 right-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
          >
            {Math.round(view.zoom * 100)}% ↺
          </button>
        )}
      </div>
    </FloatingWindow>
  );
}
