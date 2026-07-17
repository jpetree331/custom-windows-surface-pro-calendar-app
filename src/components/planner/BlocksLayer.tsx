"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import type { Block } from "@/lib/db/types";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";
import { TEXT_SIZE_PT } from "@/lib/ink/tools";
import { addBlock, deleteBlock, makeTextBlock, updateBlock, copyBlockToClipboard, carryTaskForward } from "@/lib/blocks/actions";
import { usePlannerUI } from "./ui-context";

function ImageContent({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full select-none object-fill" draggable={false} />;
}

const LAST_CUSTOM_KEY = "jotter.lastTextColor";

function BlockView({ block, pageWidth }: { block: Block; pageWidth: number }) {
  const ui = usePlannerUI();
  const selected = ui.selectedBlockId === block.id;
  // Text-color swatches = HER categories (this year's only), deduped + black.
  const categories =
    useLiveQuery(
      () => db.categories.where("plannerId").equals(ui.plannerId).sortBy("order"),
      [ui.plannerId]
    ) ?? [];
  const [lastCustom, setLastCustom] = useState<string | null>(() =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(LAST_CUSTOM_KEY)
  );
  const swatches = (() => {
    const seen = new Set<string>();
    const out: { color: string; name: string }[] = [];
    for (const c of categories) {
      const key = c.color.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ color: c.color, name: c.name });
    }
    if (!seen.has("#000000")) out.push({ color: "#000000", name: "Black" });
    if (lastCustom && !seen.has(lastCustom.toLowerCase()) && lastCustom.toLowerCase() !== "#000000") {
      out.push({ color: lastCustom, name: "Custom" });
    }
    return out;
  })();
  const customColorRef = useRef<HTMLInputElement>(null);
  const scale = pageWidth / PAGE_W;
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const setTextColor = (color: string) =>
    void updateBlock(block, { ...block, color, categoryId: undefined, updatedAt: Date.now() });
  const dragState = useRef<{ startX: number; startY: number; orig: Block; mode: "move" | "resize" } | null>(null);

  const commitDrag = (e: PointerEvent | React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    dragState.current = null;
    const dx = (e.clientX - st.startX) / scale;
    const dy = (e.clientY - st.startY) / scale;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const after: Block =
      st.mode === "move"
        ? {
            ...st.orig,
            x: Math.max(0, Math.min(PAGE_W - st.orig.w, st.orig.x + dx)),
            y: Math.max(0, Math.min(PAGE_H - st.orig.h, st.orig.y + dy)),
            updatedAt: Date.now(),
          }
        : {
            ...st.orig,
            w: Math.max(40, st.orig.w + dx),
            h: Math.max(24, st.orig.h + dy),
            updatedAt: Date.now(),
          };
    void updateBlock(st.orig, after);
  };

  const startDrag = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (ui.tool !== "select" || editing) return;
    e.stopPropagation();
    ui.setSelectedBlockId(block.id);
    dragState.current = { startX: e.clientX, startY: e.clientY, orig: block, mode };
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
    const host = e.currentTarget.closest("[data-block-id]") as HTMLElement | null;
    const target = host ?? (e.currentTarget as HTMLElement);
    if (st.mode === "move") target.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  };

  const saveText = () => {
    const el = textRef.current;
    const text = el?.innerText ?? "";
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
    if (text !== block.content || fitted.w !== undefined) {
      void updateBlock(block, { ...block, content: text, ...fitted, updatedAt: Date.now() });
    }
  };

  return (
    <div
      data-block-id={block.id}
      className="absolute"
      style={{
        left: block.x * scale,
        top: block.y * scale,
        // While editing, expand to a comfortable size; shrink-to-fit on Done.
        width: (editing ? Math.max(block.w, 280) : block.w) * scale,
        height: (editing ? Math.max(block.h, 110) : block.h) * scale,
        zIndex: block.z,
        pointerEvents: ui.tool === "select" ? "auto" : "none",
        outline: selected ? "2px solid #3b82f6" : "1px dashed rgba(59,130,246,0)",
        transform: undefined,
      }}
      onPointerDown={(e) => startDrag(e, "move")}
      onPointerMove={onDragMove}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        commitDrag(e);
      }}
      onDoubleClick={() => {
        if (block.type !== "image" && ui.tool === "select") {
          setEditing(true);
          setTimeout(() => textRef.current?.focus(), 0);
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
              style={{ width: 14 * scale + 6, height: 14 * scale + 6 }}
            />
          )}
          <div
            ref={textRef}
            contentEditable={editing}
            suppressContentEditableWarning
            onBlur={saveText}
            onPointerDown={(e) => editing && e.stopPropagation()}
            className={`h-full w-full whitespace-pre-wrap break-words font-[500] leading-snug ${
              editing ? "cursor-text bg-white/70 ring-1 ring-blue-300" : ""
            } ${block.type === "task" && block.checked ? "line-through opacity-60" : ""}`}
            style={{ fontSize: TEXT_SIZE_PT * 1.9 * scale, color: block.color ?? "#0f172a" }}
          >
            {block.content}
          </div>
        </div>
      )}
      {selected && (
        <>
          <div
            data-resize-handle
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
            onPointerDown={(e) => startDrag(e, "resize")}
            onPointerMove={onDragMove}
            onPointerUp={(e) => commitDrag(e)}
          />
          <div className="absolute -top-8 left-0 flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {block.type !== "image" && (
              <>
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
                  defaultValue={lastCustom ?? "#0f172a"}
                  className="hidden"
                  onChange={(e) => {
                    const c = e.target.value;
                    localStorage.setItem(LAST_CUSTOM_KEY, c);
                    setLastCustom(c);
                    setTextColor(c);
                  }}
                />
              </>
            )}
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
        </>
      )}
    </div>
  );
}

/** All blocks on one page + click-to-create for the text tool. */
export default function BlocksLayer({ pageId }: { pageId: string }) {
  const ui = usePlannerUI();
  const hostRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const blocks = useLiveQuery(() => db.blocks.where("pageId").equals(pageId).toArray(), [pageId]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPageWidth(el.clientWidth));
    ro.observe(el);
    setPageWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (ui.tool === "text") {
      const rect = hostRef.current!.getBoundingClientRect();
      const scale = PAGE_W / rect.width;
      // New text inherits the active pen color (Jo writes in category colors)
      const block = makeTextBlock(
        pageId,
        (e.clientX - rect.left) * scale,
        (e.clientY - rect.top) * scale,
        "",
        "text",
        ui.penColor
      );
      void addBlock(block).then(() => {
        ui.setTool("select");
        ui.setSelectedBlockId(block.id);
      });
    } else if (ui.tool === "select") {
      ui.setSelectedBlockId(null);
    }
  };

  return (
    <div
      ref={hostRef}
      data-blocks-layer={pageId}
      className="absolute inset-0"
      style={{ pointerEvents: ui.tool === "select" || ui.tool === "text" ? "auto" : "none" }}
      onPointerDown={onPointerDown}
    >
      {pageWidth > 0 &&
        (blocks ?? []).map((b) => <BlockView key={b.id} block={b} pageWidth={pageWidth} />)}
    </div>
  );
}
