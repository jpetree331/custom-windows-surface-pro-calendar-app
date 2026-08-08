"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { createNote, deleteNote, moveNote, noteDisplayTitle, updateNoteChrome } from "@/lib/notes/actions";
import NoteWindow from "./NoteWindow";

type NotesSort = "alpha" | "recent" | "custom";
const SORT_KEY = "jotter.notesSort";
const SORTS: { value: NotesSort; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "recent", label: "Recent" },
  { value: "custom", label: "Custom" },
];

/**
 * Owns the Notepad: a hover/tap menu anchored at the 🗒 side button plus
 * every open note's floating window. Notes are app-global.
 *
 * Z-bands (Jo r11): note windows live at 1000–2600 (renormalized before they
 * can climb higher); dialogs/popovers sit at 3000+; this menu at 3990+ so it
 * is never behind a note parked next to the button.
 */
export default function NotepadManager({
  menuAnchor,
  onMenuClose,
  onNoteFocus,
}: {
  menuAnchor: { top: number; right: number } | null;
  onMenuClose: () => void;
  /** Reports which note has focus (Ctrl+V paste targeting). */
  onNoteFocus: (noteId: string) => void;
}) {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? [];
  const openNotes = notes.filter((n) => n.open);
  // auto-derived titles: first line of each note's first text block
  const noteBlocks =
    useLiveQuery(
      () => db.blocks.where("pageId").anyOf(notes.map((n) => n.id)).toArray(),
      [notes.map((n) => n.id).join(",")]
    ) ?? [];
  const firstText = new Map<string, string>();
  // "Recent" means recently WRITTEN IN: note.updatedAt only moves on title
  // edits, so fold in each note's newest block edit too.
  const lastEdit = new Map<string, number>();
  for (const b of [...noteBlocks].sort((a, b) => a.createdAt - b.createdAt)) {
    if (b.type !== "image" && b.content.trim() && !firstText.has(b.pageId)) {
      firstText.set(b.pageId, b.content);
    }
    lastEdit.set(b.pageId, Math.max(lastEdit.get(b.pageId) ?? 0, b.updatedAt));
  }
  const activityOf = (n: (typeof notes)[number]) => Math.max(n.updatedAt, lastEdit.get(n.id) ?? 0);
  // stable "Note N" fallback numbering by age, independent of the sort mode
  const byCreated = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  const titleOf = (noteId: string) => {
    const i = byCreated.findIndex((n) => n.id === noteId);
    return i >= 0 ? noteDisplayTitle(byCreated[i], firstText.get(noteId), i) : "Note";
  };

  const [sort, setSort] = useState<NotesSort>(() => {
    if (typeof localStorage === "undefined") return "recent";
    const saved = localStorage.getItem(SORT_KEY) as NotesSort | null;
    return saved === "alpha" || saved === "custom" ? saved : "recent";
  });
  const setSortPersist = (s: NotesSort) => {
    localStorage.setItem(SORT_KEY, s);
    setSort(s);
  };
  const displayed = [...notes].sort((a, b) => {
    if (sort === "alpha") return titleOf(a.id).localeCompare(titleOf(b.id));
    if (sort === "custom") return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    return activityOf(b) - activityOf(a);
  });

  // z-order: one incrementing counter across all note windows, renormalized
  // before it can climb into the dialog bands (3000+)
  const zRef = useRef(100);
  useEffect(() => {
    const maxZ = Math.max(100, ...notes.map((n) => n.z));
    if (maxZ >= zRef.current) zRef.current = maxZ + 1;
  }, [notes]);
  const raiseNote = (id: string, z: number) => {
    if (z >= zRef.current) return; // already on top
    if (zRef.current >= 1500) {
      void (async () => {
        const sorted = (await db.notes.toArray()).sort((a, b) => a.z - b.z);
        for (let i = 0; i < sorted.length; i++) {
          await updateNoteChrome(sorted[i].id, { z: 100 + i });
        }
        zRef.current = 100 + sorted.length;
        await updateNoteChrome(id, { z: ++zRef.current });
      })();
      return;
    }
    void updateNoteChrome(id, { z: ++zRef.current });
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      {menuAnchor && (
        <>
          <div
            className="fixed inset-0 z-[3990]"
            data-notepad-menu-backdrop
            onClick={onMenuClose}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenuClose();
            }}
          />
          <div
            data-notepad-menu
            className="fixed z-[4000] max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ top: Math.min(menuAnchor.top, window.innerHeight - 300), right: menuAnchor.right }}
            // the menu itself keeps hover-open alive; leaving it closes
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") onMenuClose();
            }}
          >
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">🗒 Notes</span>
              <span className="flex gap-0.5" data-notes-sort>
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    data-notes-sort-option={s.value}
                    title={`Sort notes: ${s.label}`}
                    onClick={() => setSortPersist(s.value)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      sort === s.value ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
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
            {displayed.map((n, i) => (
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
                    void updateNoteChrome(n.id, { open: true, z: ++zRef.current });
                    onNoteFocus(n.id);
                    onMenuClose();
                  }}
                >
                  {titleOf(n.id)}
                  {n.open && <span className="ml-1 text-xs text-slate-400">(open)</span>}
                </button>
                {sort === "custom" && (
                  <>
                    <button
                      data-note-action="up"
                      disabled={i === 0}
                      title="Move up"
                      className="rounded px-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                      onClick={() => void moveNote(n.id, -1)}
                    >
                      ▲
                    </button>
                    <button
                      data-note-action="down"
                      disabled={i === displayed.length - 1}
                      title="Move down"
                      className="rounded px-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                      onClick={() => void moveNote(n.id, 1)}
                    >
                      ▼
                    </button>
                  </>
                )}
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
          onFocus={() => {
            onNoteFocus(n.id);
            raiseNote(n.id, n.z);
          }}
        />
      ))}
    </>
  );
}
