"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/db/types";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { updateNote, updateNoteChrome } from "@/lib/notes/actions";
import {
  getClipboardBlock,
  hasSelectionClipboard,
  pasteAnyClipboardCentered,
} from "@/lib/blocks/actions";
import BlocksLayer from "../BlocksLayer";
import InkCanvas from "../InkCanvas";
import SelectionOverlay from "../SelectionOverlay";
import { usePlannerUI } from "../ui-context";
import FloatingWindow from "./FloatingWindow";

const MAX_ZOOM = 3;
const PAGE_ASPECT = PAGE_H / PAGE_W;

/**
 * One floating note. The note's writing surface is a FIXED canvas (pageW css
 * px wide at 1×, PAGE_W × PAGE_H logical units) and the window is a viewport
 * onto it, anchored top-left.
 *
 * Why fixed (Jo r12): the window rect is stored as a fraction of the screen,
 * so rotating the tablet changed the window's pixel width — and since text
 * and ink scale off that width, all her handwriting resized and appeared to
 * drift. With the canvas pinned, rotating only changes how MUCH of the note
 * you can see; she resizes the window if she wants more. It also restores a
 * true PAGE_W × PAGE_H space, so the shared selection/paste clamps are
 * correct inside notes as well as on calendar pages.
 *
 * Two fingers pinch (1–3×); one finger pans whenever the canvas overflows.
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
  const ui = usePlannerUI();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // css px, ≤ 0
  // Title is click-to-edit (Jo r11): a real <input> at rest let Windows Ink's
  // handwriting panel hijack pen strokes near the top of the note and type
  // them into the title. A button can't receive handwriting.
  const [editingTitle, setEditingTitle] = useState(false);
  // Right-click paste, mirroring the calendar page's menu: pasting INTO a
  // note can't rely on Ctrl+V, because the note's own text box often holds
  // focus and a text paste must not be hijacked (Jo r12).
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinchBase = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Adopt the current window width ONCE for notes made before r12, so no
  // existing note visibly re-scales the first time it opens. Ignore
  // implausible measurements (a collapsed//hidden window would otherwise
  // bake in a canvas Jo can never write on).
  useEffect(() => {
    if (note.pageW === undefined && box.w >= 120) {
      void updateNoteChrome(note.id, { pageW: Math.round(box.w) });
    }
  }, [note.pageW, note.id, box.w]);

  const baseW = Math.max(240, note.pageW ?? box.w);
  const pageWpx = baseW * zoom;
  const pageHpx = pageWpx * PAGE_ASPECT;

  const clampPan = (x: number, y: number) => ({
    x: Math.min(0, Math.max(Math.min(0, box.w - pageWpx), x)),
    y: Math.min(0, Math.max(Math.min(0, box.h - pageHpx), y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinchBase.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
    const prev = touches.current.get(e.pointerId)!;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2 && pinchBase.current) {
      const [a, b] = [...touches.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.min(
        MAX_ZOOM,
        Math.max(1, (pinchBase.current.zoom * dist) / Math.max(1, pinchBase.current.dist))
      );
      // keep the viewport's center point anchored while scaling
      const ratio = next / zoom;
      const cx = box.w / 2 - pan.x;
      const cy = box.h / 2 - pan.y;
      setZoom(next);
      setPan(clampPan(box.w / 2 - cx * ratio, box.h / 2 - cy * ratio));
      return;
    }
    // one finger pans the canvas — unless a finger-drawn selection is what
    // she's actually doing (the ink canvas owns marquee/lasso touches)
    if (touches.current.size === 1 && ui.tool !== "marquee" && ui.tool !== "lasso") {
      setPan((p) => clampPan(p.x + (e.clientX - prev.x), p.y + (e.clientY - prev.y)));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinchBase.current = null;
  };

  const overflows = pageWpx > box.w + 1 || pageHpx > box.h + 1;

  return (
    <FloatingWindow
      name={`note-${note.id}`}
      rect={note}
      z={note.z}
      onFocus={onFocus}
      onClose={() => void updateNoteChrome(note.id, { open: false })}
      onCommitRect={(r) => void updateNoteChrome(note.id, r)}
      title={
        editingTitle ? (
          <input
            key={note.id}
            autoFocus
            data-note-title={note.id}
            defaultValue={note.title}
            placeholder={derivedTitle}
            // commit on blur (not per keystroke): a controlled input racing
            // the async liveQuery echo drops characters under fast typing
            onBlur={(e) => {
              void updateNote(note.id, { title: e.target.value });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
          />
        ) : (
          <button
            data-note-title-display={note.id}
            title="Rename this note"
            onClick={() => setEditingTitle(true)}
            // max-w leaves bare title-bar space so the window stays draggable
            className="max-w-[75%] truncate text-left text-sm font-semibold text-slate-800 hover:text-blue-700"
          >
            {note.title.trim() || derivedTitle}
          </button>
        )
      }
    >
      <div
        ref={viewportRef}
        className="relative h-full w-full overflow-hidden rounded-b-lg bg-slate-200/70"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {baseW > 0 && (
          <div
            data-note-page={note.id}
            className="absolute bg-white"
            style={{
              left: pan.x,
              top: pan.y,
              width: pageWpx,
              height: pageHpx,
              containerType: "inline-size",
              isolation: "isolate",
            }}
          >
            {/* autoEditFirst: cursor lands in the body text box on open (Jo) */}
            <BlocksLayer pageId={note.id} defaultFontSize={18} autoEditFirst />
            <InkCanvas pageId={note.id} />
            {/* r12: selection tools work in notes too — the overlay used to
                exist only on calendar pages, so a marquee here selected
                things invisibly */}
            {ui.selection?.pageId === note.id && <SelectionOverlay />}
          </div>
        )}
        {menu && (
          <>
            <div
              className="fixed inset-0 z-[3300]"
              data-note-menu-backdrop
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              data-note-menu
              className="fixed z-[3310] w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
              style={{
                left: Math.min(menu.x, window.innerWidth - 190),
                top: Math.min(menu.y, window.innerHeight - 90),
              }}
            >
              <button
                data-note-menu-item="paste"
                disabled={!hasSelectionClipboard() && !getClipboardBlock()}
                onClick={() => {
                  setMenu(null);
                  void pasteAnyClipboardCentered(note.id).then((r) => {
                    if (!r) return;
                    if (r.kind === "selection") ui.setSelection(r.selection);
                    else ui.setSelectedBlockId(r.block.id);
                  });
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-40"
              >
                📋 Paste here
              </button>
            </div>
          </>
        )}
        {(zoom > 1 || (overflows && (pan.x < 0 || pan.y < 0))) && (
          <button
            data-note-zoom-reset
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="absolute bottom-1 right-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
          >
            {Math.round(zoom * 100)}% ↺
          </button>
        )}
      </div>
    </FloatingWindow>
  );
}
