"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/db/types";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { updateNote } from "@/lib/notes/actions";
import BlocksLayer from "../BlocksLayer";
import InkCanvas from "../InkCanvas";
import FloatingWindow from "./FloatingWindow";

/**
 * One floating note: a real mini planner page (BlocksLayer + InkCanvas keyed
 * by pageId = note.id), so every pen/text/select tool Jo already knows works
 * inside it. The page letterboxes to keep the 1000:1300 coordinate space.
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pageBox, setPageBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth, (el.clientHeight * PAGE_W) / PAGE_H);
      setPageBox({ w, h: (w * PAGE_H) / PAGE_W });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      <div ref={bodyRef} className="flex h-full w-full items-center justify-center overflow-hidden bg-slate-200/60 p-1">
        {pageBox.w > 0 && (
          <div
            data-note-page={note.id}
            className="relative shrink-0 overflow-hidden rounded bg-white shadow-inner"
            style={{
              width: pageBox.w,
              height: pageBox.h,
              containerType: "inline-size",
              isolation: "isolate",
            }}
          >
            <BlocksLayer pageId={note.id} />
            <InkCanvas pageId={note.id} />
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}
