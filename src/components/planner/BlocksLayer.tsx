"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Block } from "@/lib/db/types";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { TEXT_SIZE_PT } from "@/lib/ink/tools";
import { addBlock, deleteBlock, makeTextBlock, updateBlock, copyBlockToClipboard, carryTaskForward } from "@/lib/blocks/actions";
import { isCornerHandle, RESIZE_HANDLES, resizeRect, resizeRectAspectLocked } from "./resize-handles";
import { shapeAtPoint, shapeRect } from "@/lib/ink/select";
import { usePlannerUI } from "./ui-context";
import { useColorSwatches } from "./useColorSwatches";

function ImageContent({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full select-none object-fill" draggable={false} />;
}

function BlockView({
  block,
  pageWidth,
  pageLogicalH,
  initialEdit = false,
  onCtrlPick,
}: {
  block: Block;
  pageWidth: number;
  /** Logical height of the host — PAGE_H on calendar pages, but a note's
   *  free-aspect page varies with its window shape (clamps must follow). */
  pageLogicalH: number;
  /** Open ready-to-type on mount (a note's body box — Jo r11). */
  initialEdit?: boolean;
  /** ctrl/⌘-click: add or remove this block from a multi-item selection. */
  onCtrlPick?: (blockId: string) => void;
}) {
  const ui = usePlannerUI();
  const selected = ui.selectedBlockId === block.id;
  // Text-color swatches shared with the ⬚ selection recolor bar.
  const { swatches, rememberCustom } = useColorSwatches(ui.plannerId);
  const customColorRef = useRef<HTMLInputElement>(null);
  const scale = pageWidth / PAGE_W;
  // Geometry/font styling uses container units, NOT screen px: print re-lays
  // the page out without re-running ResizeObservers, so px-scaled blocks
  // drifted off their spots on paper (Tim's "cabling" overflow). cqw resolves
  // against the page stack (containerType: inline-size) in any layout.
  const cq = (v: number) => `${(v / PAGE_W) * 100}cqw`;
  // A brand-new empty text box opens ready to type — no double-click needed.
  const [editing, setEditing] = useState(
    () =>
      initialEdit ||
      (block.type !== "image" && block.content === "" && Date.now() - block.createdAt < 3000)
  );
  const textRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) setTimeout(() => textRef.current?.focus(), 0);
  }, [editing]);

  const setTextColor = (color: string) =>
    void updateBlock(block, { ...block, color, categoryId: undefined, updatedAt: Date.now() });
  const patchStyle = (patch: Partial<Block>) =>
    void updateBlock(block, { ...block, ...patch, updatedAt: Date.now() });
  const fontSize = block.fontSize ?? TEXT_SIZE_PT;
  const dragState = useRef<{
    startX: number;
    startY: number;
    orig: Block;
    mode: "move" | "resize";
    edges?: { l?: boolean; r?: boolean; t?: boolean; b?: boolean };
  } | null>(null);

  const resizedRect = (st: NonNullable<typeof dragState.current>, dx: number, dy: number) => {
    const base = { x: st.orig.x, y: st.orig.y, w: st.orig.w, h: st.orig.h };
    const edges = st.edges ?? {};
    // Corner handles keep the item's proportions (Jo); edges free-stretch.
    const r = isCornerHandle(edges)
      ? resizeRectAspectLocked(base, edges, dx, dy, 40, 24)
      : resizeRect(base, edges, dx, dy);
    return {
      x: Math.max(0, Math.min(PAGE_W - 40, r.x)),
      y: Math.max(0, Math.min(pageLogicalH - 24, r.y)),
      w: Math.max(40, Math.min(PAGE_W, r.w)),
      h: Math.max(24, Math.min(pageLogicalH, r.h)),
    };
  };

  const commitDrag = (e: PointerEvent | React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    dragState.current = null;
    const dx = (e.clientX - st.startX) / scale;
    const dy = (e.clientY - st.startY) / scale;
    // Only a true no-op tap skips the write — a real pen nudge, however
    // small, must commit (the old <1-unit dead zone silently ate moves).
    if (dx === 0 && dy === 0) return;
    const after: Block =
      st.mode === "move"
        ? {
            ...st.orig,
            x: Math.max(0, Math.min(PAGE_W - st.orig.w, st.orig.x + dx)),
            y: Math.max(0, Math.min(pageLogicalH - st.orig.h, st.orig.y + dy)),
            updatedAt: Date.now(),
          }
        : { ...st.orig, ...resizedRect(st, dx, dy), updatedAt: Date.now() };
    void updateBlock(st.orig, after);
  };

  const startDrag = (
    e: React.PointerEvent,
    mode: "move" | "resize",
    edges?: { l?: boolean; r?: boolean; t?: boolean; b?: boolean },
    /** the ✥ grip works with ANY tool, including pen/highlighter (Jo r13) */
    force = false
  ) => {
    const usable = force || ui.tool === "select" || ui.tool === "text" || selected;
    // Stop here regardless: letting the event reach the layer is what made
    // the text tool drop a NEW box on top of the one she aimed at (Jo r13).
    if (usable) e.stopPropagation();
    if (!usable || editing) return;
    // ctrl/⌘-click gathers items into one selection box so they move together
    if (e.ctrlKey || e.metaKey) {
      onCtrlPick?.(block.id);
      return;
    }
    ui.setSelectedBlockId(block.id);
    dragState.current = { startX: e.clientX, startY: e.clientY, orig: block, mode, edges };
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointer — capture is best-effort
    }
  };

  const onDragMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    const dx = (e.clientX - st.startX) / scale;
    const dy = (e.clientY - st.startY) / scale;
    const host = (e.currentTarget as HTMLElement).closest("[data-block-id]") as HTMLElement | null;
    const target = host ?? (e.currentTarget as HTMLElement);
    // previews in cqw too: a leftover px override would stop scaling in print
    if (st.mode === "move") {
      target.style.transform = `translate(${cq(dx)}, ${cq(dy)})`;
    } else {
      // live preview of the resize on the block itself
      const r = resizedRect(st, dx, dy);
      target.style.left = cq(r.x);
      target.style.top = cq(r.y);
      target.style.width = cq(r.w);
      target.style.height = cq(r.h);
    }
  };

  const saveText = () => {
    const el = textRef.current;
    const text = el?.innerText ?? "";
    // Abandoned empty box → remove it instead of leaving invisible litter.
    if (!text.trim() && !block.content.trim() && block.type === "text") {
      setEditing(false);
      ui.setSelectedBlockId(null);
      void deleteBlock(block);
      return;
    }
    // Shrink the box to fit its text (Jo: a full-size empty box blocks the
    // pen near the words). Measure at natural size, then persist.
    let fitted: Partial<Block> = {};
    if (el && text.trim()) {
      const prev = { width: el.style.width, maxWidth: el.style.maxWidth, height: el.style.height };
      el.style.width = "max-content";
      el.style.maxWidth = `${PAGE_W * 0.7 * scale}px`;
      el.style.height = "auto";
      const checkboxPad = block.type === "task" ? 26 : 0;
      fitted = {
        w: Math.max(60, Math.min(PAGE_W * 0.7, el.offsetWidth / scale + 8) + checkboxPad),
        h: Math.max(24, el.offsetHeight / scale + 6),
      };
      el.style.width = prev.width;
      el.style.maxWidth = prev.maxWidth;
      el.style.height = prev.height;
    }
    setEditing(false);
    // No-op guard: auto-opened note bodies blur on every open — an unchanged
    // box must not write (it would spam undo entries and updatedAt).
    const dimsChanged =
      fitted.w !== undefined &&
      (Math.abs(fitted.w - block.w) > 0.5 || Math.abs((fitted.h ?? block.h) - block.h) > 0.5);
    if (text !== block.content || dimsChanged) {
      void updateBlock(block, { ...block, content: text, ...fitted, updatedAt: Date.now() });
    }
  };

  return (
    <div
      data-block-id={block.id}
      className="absolute"
      style={{
        left: cq(block.x),
        top: cq(block.y),
        // While editing, expand to a comfortable size; shrink-to-fit on Done.
        width: cq(editing ? Math.max(block.w, 280) : block.w),
        height: cq(editing ? Math.max(block.h, 110) : block.h),
        // A SELECTED block rises above the ink canvas and stays interactive
        // with ANY tool — tap-to-select (InkCanvas) then drag to move.
        zIndex: selected ? 45 : block.z,
        // The text tool must HIT existing boxes (select/resize/edit them);
        // only taps on empty page area create a new one (Jo r13).
        pointerEvents:
          ui.tool === "select" || ui.tool === "text" || selected ? "auto" : "none",
        outline: selected ? "2px solid #3b82f6" : "1px dashed rgba(59,130,246,0)",
        transform: undefined,
        // NONE, like every other drag surface: Windows treats a pen drag as
        // pannable "direct manipulation" — without this the browser stole the
        // move mid-drag (Jo: "doesn't move, then jumps back").
        touchAction: "none",
      }}
      onPointerDown={(e) => startDrag(e, "move")}
      onPointerMove={onDragMove}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        commitDrag(e);
      }}
      onDoubleClick={() => {
        // the effect above focuses the box as soon as `editing` flips
        if (block.type !== "image" && (ui.tool === "select" || ui.tool === "text")) {
          setEditing(true);
        }
      }}
    >
      {block.type === "image" && block.imageBlob ? (
        <ImageContent blob={block.imageBlob} />
      ) : (
        <div className="flex h-full w-full items-start gap-1 overflow-hidden">
          {block.type === "task" && (
            <input
              type="checkbox"
              checked={block.checked ?? false}
              onChange={(e) =>
                void updateBlock(block, { ...block, checked: e.target.checked, updatedAt: Date.now() })
              }
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-[2px] shrink-0"
              style={{ width: `calc(${cq(14)} + 6px)`, height: `calc(${cq(14)} + 6px)` }}
            />
          )}
          <div
            ref={textRef}
            contentEditable={editing}
            suppressContentEditableWarning
            onBlur={saveText}
            onPointerDown={(e) => editing && e.stopPropagation()}
            className={`h-full w-full whitespace-pre-wrap break-words leading-snug ${
              editing ? "cursor-text bg-white/70 ring-1 ring-blue-300" : ""
            } ${block.type === "task" && block.checked ? "line-through opacity-60" : ""}`}
            style={{
              fontSize: cq(fontSize * 1.9),
              textAlign: block.align ?? "left",
              color: block.color ?? "#0f172a",
              fontWeight: block.bold ? 700 : 500,
              fontStyle: block.italic ? "italic" : undefined,
              textDecoration: block.underline ? "underline" : undefined,
            }}
          >
            {block.content}
          </div>
        </div>
      )}
      {selected && (
        <>
          {/* ✥ grip: drag the box with ANY tool active — pen, text, hand —
              without first switching tools (Jo r13). */}
          <button
            data-block-grip={block.id}
            title="Drag to move this box (works with any tool)"
            className="absolute -left-1.5 -top-6 flex h-5 w-5 cursor-move items-center justify-center rounded border border-white bg-blue-600 text-[11px] font-bold text-white shadow print:hidden"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => startDrag(e, "move", undefined, true)}
            onPointerMove={onDragMove}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "";
              const host = (e.currentTarget as HTMLElement).closest("[data-block-id]") as HTMLElement | null;
              if (host) host.style.transform = "";
              commitDrag(e);
            }}
          >
            ✥
          </button>
          {/* 8 handles — same resize box as the ⬚ selection, but here the
              handles resize the ITEM itself (picture, text box, task) */}
          {RESIZE_HANDLES.map((hd) => (
            <div
              key={hd.key}
              data-resize-handle={hd.key}
              className={`absolute h-3 w-3 rounded-sm border border-white bg-blue-500 print:hidden ${hd.pos}`}
              style={{ cursor: hd.cursor, touchAction: "none" }}
              onPointerDown={(e) => startDrag(e, "resize", hd)}
              onPointerMove={onDragMove}
              onPointerUp={(e) => commitDrag(e)}
            />
          ))}
          <div
            className={`absolute flex flex-col gap-0.5 print:hidden ${
              // near the RIGHT edge the bar anchors right so it can't clip
              // off the page (Jo: "right half gets cut off")
              block.x * scale + 240 > pageWidth ? "right-0 items-end" : "left-0 items-start"
            }`}
            style={
              // near the TOP the bar flips below the box (Jo: "can't see the
              // options bar" on blocks at the top of a page/note)
              block.y * scale < (block.type !== "image" ? 92 : 36)
                ? { top: "calc(100% + 6px)" }
                : { bottom: "calc(100% + 6px)" }
            }
            // preventDefault: bar taps must NOT steal focus from the text box —
            // otherwise picking a color mid-edit blurred and closed the editor
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {block.type !== "image" && (
              <div className="flex items-center gap-1 rounded bg-white/90 px-1 py-0.5 shadow-sm" data-text-bar="colors">
                {swatches.map((s) => (
                  <button
                    key={s.color}
                    title={`Text color: ${s.name}`}
                    data-text-color={s.color}
                    onClick={() => setTextColor(s.color)}
                    className={`h-4 w-4 rounded-full border ${
                      (block.color ?? "#0f172a").toLowerCase() === s.color.toLowerCase()
                        ? "border-black ring-2 ring-white"
                        : "border-white/70"
                    }`}
                    style={{ background: s.color }}
                  />
                ))}
                {/* relative wrapper: the invisible input sits HERE, so the
                    browser anchors its color popup at the box, not at (0,0) */}
                <span className="relative inline-flex">
                  <button
                    title="Pick any text color"
                    data-text-color-custom
                    onClick={() => customColorRef.current?.click()}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-bold leading-none text-slate-700"
                  >
                    +
                  </button>
                  <input
                    ref={customColorRef}
                    type="color"
                    defaultValue="#0f172a"
                    className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
                    onChange={(e) => {
                      const c = e.target.value;
                      rememberCustom(c);
                      setTextColor(c);
                    }}
                  />
                </span>
              </div>
            )}
            {block.type !== "image" && (
              // second line (Jo: colors on top, editing tools on the bottom)
              <div className="flex items-center gap-1 rounded bg-white/90 px-1 py-0.5 shadow-sm" data-text-bar="tools">
                <button
                  data-font-action="smaller"
                  title="Smaller text"
                  onClick={() => patchStyle({ fontSize: Math.max(5, fontSize - 1) })}
                  className="rounded px-1 text-[12px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  −
                </button>
                <span data-font-size className="min-w-5 text-center text-[11px] font-semibold text-slate-700">
                  {fontSize}
                </span>
                <button
                  data-font-action="larger"
                  title="Larger text"
                  onClick={() => patchStyle({ fontSize: Math.min(28, fontSize + 1) })}
                  className="rounded px-1 text-[12px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  ＋
                </button>
                <button
                  data-font-action="bold"
                  title="Bold"
                  onClick={() => patchStyle({ bold: !block.bold })}
                  className={`rounded px-1 text-[12px] font-extrabold ${block.bold ? "bg-slate-300" : "hover:bg-slate-200"}`}
                >
                  B
                </button>
                <button
                  data-font-action="italic"
                  title="Italic"
                  onClick={() => patchStyle({ italic: !block.italic })}
                  className={`rounded px-1.5 text-[12px] italic ${block.italic ? "bg-slate-300" : "hover:bg-slate-200"}`}
                >
                  I
                </button>
                <button
                  data-font-action="underline"
                  title="Underline"
                  onClick={() => patchStyle({ underline: !block.underline })}
                  className={`rounded px-1 text-[12px] underline ${block.underline ? "bg-slate-300" : "hover:bg-slate-200"}`}
                >
                  U
                </button>
                <span className="mx-0.5 h-4 w-px bg-slate-300" />
                {/* left / center / right (Jo r13) */}
                {([
                  ["left", "◧"],
                  ["center", "▥"],
                  ["right", "◨"],
                ] as const).map(([val, icon]) => (
                  <button
                    key={val}
                    data-align-action={val}
                    title={`Align ${val}`}
                    onClick={() => patchStyle({ align: val })}
                    className={`rounded px-1 text-[12px] ${
                      (block.align ?? "left") === val ? "bg-slate-300" : "hover:bg-slate-200"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1">
            <button
              className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              onClick={() => copyBlockToClipboard(block)}
              title="Copy (paste with Ctrl+V on any page)"
            >
              Copy
            </button>
            {block.type === "task" && !block.checked && (
              <button
                className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                onClick={() => void carryTaskForward(block)}
                title="Copy this task to next week"
              >
                → Next week
              </button>
            )}
            <button
              className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              onClick={() => {
                ui.setSelectedBlockId(null);
                void deleteBlock(block);
              }}
            >
              Delete
            </button>
            <button
              data-block-action="done"
              className="rounded bg-slate-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              title="Deselect"
              onClick={() => {
                if (editing) saveText();
                ui.setSelectedBlockId(null);
              }}
            >
              Done
            </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** All blocks on one page + click-to-create for the text tool. */
export default function BlocksLayer({
  pageId,
  defaultFontSize = 12,
  autoEditFirst = false,
}: {
  pageId: string;
  /** Starting size for NEW text boxes (12 calendar / 18 notes — Jo). */
  defaultFontSize?: number;
  /** Notes: the oldest text box opens ready to type on mount (Jo r11). */
  autoEditFirst?: boolean;
}) {
  const ui = usePlannerUI();
  const hostRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState({ w: 0, logicalH: PAGE_H });
  const blocks = useLiveQuery(() => db.blocks.where("pageId").equals(pageId).toArray(), [pageId]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () =>
      setPageDims({
        w: el.clientWidth,
        // calendar pages are aspect-locked so this computes ≈PAGE_H; a note's
        // free-aspect page yields its true logical height (drag clamps use it)
        logicalH:
          el.clientWidth > 0 ? (el.clientHeight * PAGE_W) / el.clientWidth : PAGE_H,
      });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  /** ctrl/⌘-click gathers blocks into the standard dashed selection box, so
   *  move / copy / cut / delete / resize all work on the group with the
   *  machinery that already exists (Jo r13). */
  const onCtrlPick = (blockId: string) => {
    const all = blocks ?? [];
    const sel = ui.selection?.pageId === pageId ? ui.selection : null;
    const base = sel?.blockIds.length ? sel.blockIds : ui.selectedBlockId ? [ui.selectedBlockId] : [];
    const next = base.includes(blockId) ? base.filter((b) => b !== blockId) : [...base, blockId];
    const rows = all.filter((b) => next.includes(b.id));
    if (rows.length < 2) {
      ui.setSelection(null);
      ui.setSelectedBlockId(rows[0]?.id ?? null);
      return;
    }
    const rect = {
      x: Math.min(...rows.map((b) => b.x)),
      y: Math.min(...rows.map((b) => b.y)),
      w: 0,
      h: 0,
    };
    rect.w = Math.max(...rows.map((b) => b.x + b.w)) - rect.x;
    rect.h = Math.max(...rows.map((b) => b.y + b.h)) - rect.y;
    ui.setSelectedBlockId(null);
    ui.setSelection({ pageId, rect, strokeIds: sel?.strokeIds ?? [], blockIds: next });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (ui.tool === "text") {
      // First tap-away commits the box being edited; the NEXT tap places a
      // new one. The tool itself never changes (Jo switches when she's ready).
      if (ui.selectedBlockId) {
        ui.setSelectedBlockId(null);
        return;
      }
      const rect = hostRef.current!.getBoundingClientRect();
      const scale = PAGE_W / rect.width;
      // New text starts in readable dark ink (Tim: light-blue pen color on
      // the blue page was illegible); the swatches recolor it in one tap.
      const block = makeTextBlock(
        pageId,
        (e.clientX - rect.left) * scale,
        (e.clientY - rect.top) * scale,
        "",
        "text",
        undefined,
        defaultFontSize
      );
      void addBlock(block).then(() => {
        ui.setSelectedBlockId(block.id);
      });
    } else if (ui.tool === "select") {
      ui.setSelectedBlockId(null);
      // Nothing here? Maybe a drawn shape is — tapping one with the hand
      // tool selects it, which gives it the resize handles (Jo r13).
      const rect = hostRef.current!.getBoundingClientRect();
      const scale = PAGE_W / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const py = (e.clientY - rect.top) * scale;
      void db.strokes
        .where("pageId").equals(pageId)
        .toArray()
        .then((strokes) => {
          const hit = shapeAtPoint(strokes, px, py);
          ui.setSelection(
            hit ? { pageId, rect: shapeRect(hit), strokeIds: [hit.id], blockIds: [] } : null
          );
        });
    }
  };

  return (
    <div
      ref={hostRef}
      data-blocks-layer={pageId}
      data-logical-h={Math.round(pageDims.logicalH)}
      className="absolute inset-0"
      style={{ pointerEvents: ui.tool === "select" || ui.tool === "text" ? "auto" : "none" }}
      onPointerDown={onPointerDown}
    >
      {pageDims.w > 0 &&
        (() => {
          const firstTextId = autoEditFirst
            ? [...(blocks ?? [])]
                .filter((b) => b.type !== "image")
                .sort((a, b) => a.createdAt - b.createdAt)[0]?.id
            : undefined;
          return (blocks ?? []).map((b) => (
            <BlockView
              key={b.id}
              block={b}
              pageWidth={pageDims.w}
              pageLogicalH={pageDims.logicalH}
              initialEdit={b.id === firstTextId}
              onCtrlPick={onCtrlPick}
            />
          ));
        })()}
    </div>
  );
}
