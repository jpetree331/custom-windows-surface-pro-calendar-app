"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { createNote, deleteNote, noteDisplayTitle, updateNote } from "@/lib/notes/actions";
import FloatingWindow, { type WinRect } from "./FloatingWindow";
import NoteWindow from "./NoteWindow";

const LIST_RECT_KEY = "notepad.listWindow";
const DEFAULT_LIST_RECT: WinRect = { x: 0.62, y: 0.1, w: 0.26, h: 0.34 };

/**
 * Owns every floating Notepad window: the Notes List plus each open note.
 * Notes are app-global (shared across planner years) and reopen where they
 * were. The list window's rect lives in device-local kv (chrome, not data).
 */
export default function NotepadManager({
  listOpen,
  onListOpenChange,
}: {
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
}) {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? [];
  const openNotes = notes.filter((n) => n.open);
  const byRecent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  // auto-derived titles: first line of each note's first text block
  const noteBlocks =
    useLiveQuery(
      () => db.blocks.where("pageId").anyOf(notes.map((n) => n.id)).toArray(),
      [notes.map((n) => n.id).join(",")]
    ) ?? [];
  const firstText = new Map<string, string>();
  for (const b of [...noteBlocks].sort((a, b) => a.createdAt - b.createdAt)) {
    if (b.type !== "image" && b.content.trim() && !firstText.has(b.pageId)) {
      firstText.set(b.pageId, b.content);
    }
  }
  const titleOf = (noteId: string) => {
    const i = byRecent.findIndex((n) => n.id === noteId);
    return noteDisplayTitle(byRecent[i], firstText.get(noteId), i);
  };

  // z-order: one incrementing counter across all windows
  const zRef = useRef(100);
  useEffect(() => {
    const maxZ = Math.max(100, ...notes.map((n) => n.z));
    if (maxZ >= zRef.current) zRef.current = maxZ + 1;
  }, [notes]);
  const [listZ, setListZ] = useState(101);
  const raiseNote = (id: string, z: number) => {
    if (z >= zRef.current - 1 && z >= listZ) return; // already on top
    void updateNote(id, { z: ++zRef.current });
  };

  // list window rect persists per device in kv
  const [listRect, setListRect] = useState<WinRect>(DEFAULT_LIST_RECT);
  useEffect(() => {
    void db.kv.get(LIST_RECT_KEY).then((row) => {
      if (row?.value) setListRect(row.value as WinRect);
    });
  }, []);
  const commitListRect = (r: WinRect) => {
    setListRect(r);
    void db.kv.put({ key: LIST_RECT_KEY, value: r });
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      {listOpen && (
        <FloatingWindow
          name="notes-list"
          rect={listRect}
          z={listZ}
          onFocus={() => {
            if (listZ < zRef.current) setListZ(++zRef.current);
          }}
          onClose={() => onListOpenChange(false)}
          onCommitRect={commitListRect}
          title={<span className="text-sm font-bold text-slate-700">🗒 Notes</span>}
        >
          <div className="h-full overflow-y-auto p-1.5">
            <button
              data-notepad-action="new-note"
              onClick={() => void createNote(++zRef.current)}
              className="mb-1 w-full rounded bg-blue-600 px-2 py-1.5 text-left text-sm font-semibold text-white"
            >
              ＋ New Note
            </button>
            {byRecent.map((n) => (
              <div
                key={n.id}
                data-note-row={n.id}
                className="flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-100"
              >
                <button
                  data-note-action="open"
                  className="min-w-0 flex-1 truncate text-left text-sm text-slate-800"
                  title="Open this note"
                  onClick={() => {
                    void updateNote(n.id, { open: true, z: ++zRef.current });
                  }}
                >
                  {titleOf(n.id)}
                  {n.open && <span className="ml-1 text-xs text-slate-400">(open)</span>}
                </button>
                {confirmDelete === n.id ? (
                  <>
                    <button
                      data-note-action="delete-confirm"
                      className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white"
                      onClick={() => {
                        setConfirmDelete(null);
                        void deleteNote(n.id);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      className="text-xs text-slate-500 underline"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    data-note-action="delete"
                    title="Delete note…"
                    className="rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setConfirmDelete(n.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {notes.length === 0 && (
              <p className="px-1 py-2 text-xs text-slate-500">
                No notes yet — tap ＋ New Note, then type or write with the pen.
              </p>
            )}
          </div>
        </FloatingWindow>
      )}
      {openNotes.map((n) => (
        <NoteWindow
          key={n.id}
          note={n}
          derivedTitle={titleOf(n.id)}
          onFocus={() => raiseNote(n.id, n.z)}
        />
      ))}
    </>
  );
}
