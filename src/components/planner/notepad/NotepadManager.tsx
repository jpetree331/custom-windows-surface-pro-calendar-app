"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { createNote, deleteNote, noteDisplayTitle, updateNote } from "@/lib/notes/actions";
import NoteWindow from "./NoteWindow";

/**
 * Owns the Notepad: a hover/tap menu anchored at the 🗒 side button (Jo:
 * "like a right-click menu", replacing the old floating Notes List window)
 * plus every open note's floating window. Notes are app-global.
 */
export default function NotepadManager({
  menuAnchor,
  onMenuClose,
}: {
  menuAnchor: { top: number; right: number } | null;
  onMenuClose: () => void;
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
    return i >= 0 ? noteDisplayTitle(byRecent[i], firstText.get(noteId), i) : "Note";
  };

  // z-order: one incrementing counter across all note windows
  const zRef = useRef(100);
  useEffect(() => {
    const maxZ = Math.max(100, ...notes.map((n) => n.z));
    if (maxZ >= zRef.current) zRef.current = maxZ + 1;
  }, [notes]);
  const raiseNote = (id: string, z: number) => {
    if (z >= zRef.current) return; // already on top
    void updateNote(id, { z: ++zRef.current });
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      {menuAnchor && (
        <>
          <div
            className="fixed inset-0 z-[1400]"
            data-notepad-menu-backdrop
            onClick={onMenuClose}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenuClose();
            }}
          />
          <div
            data-notepad-menu
            className="fixed z-[1410] max-h-[60vh] w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ top: Math.min(menuAnchor.top, window.innerHeight - 300), right: menuAnchor.right }}
            // the menu itself keeps hover-open alive; leaving it closes
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") onMenuClose();
            }}
          >
            <div className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
              🗒 Notes
            </div>
            <button
              data-notepad-action="new-note"
              onClick={() => {
                void createNote(++zRef.current);
                onMenuClose();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              ＋ New Note
            </button>
            {byRecent.map((n) => (
              <div
                key={n.id}
                data-note-row={n.id}
                className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-slate-100"
              >
                <button
                  data-note-action="open"
                  className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-sm text-slate-800"
                  title="Open this note"
                  onClick={() => {
                    void updateNote(n.id, { open: true, z: ++zRef.current });
                    onMenuClose();
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
              <p className="px-3 py-1.5 text-xs text-slate-500">
                No notes yet — tap ＋ New Note, then type or write with the pen.
              </p>
            )}
          </div>
        </>
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
