"use client";

import { useEffect, useRef, useState } from "react";
import { PEN_COLORS, HIGHLIGHTER_WIDTH_PT, ERASER_RADIUS_PT, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import { usePlannerUI } from "./ui-context";

/** Bottom toolbar: pens, highlighter, eraser, text, rect, image, undo/redo, duplicate. */
export default function Toolbar({
  onAddImage,
  onDuplicatePage,
}: {
  onAddImage: (file: File) => void;
  onDuplicatePage: () => void;
}) {
  const ui = usePlannerUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  useEffect(() => history.onHistoryChange(() => force((n) => n + 1)), []);

  const toolBtn = (tool: ToolId, label: string, title: string, extra?: string) => (
    <button
      key={tool}
      data-tool={tool}
      title={title}
      onClick={() => ui.setTool(tool)}
      className={`flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg ${
        ui.tool === tool ? "bg-slate-300 shadow-inner" : "hover:bg-slate-100"
      } ${extra ?? ""}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-t border-slate-300 bg-white px-2 shadow-[0_-2px_6px_rgba(0,0,0,0.08)]">
      {toolBtn("select", "🖐", "Select / move blocks")}
      <span className="mx-1 h-6 w-px bg-slate-300" />
      {PEN_COLORS.map((p) => (
        <button
          key={p.name}
          data-pen={p.name}
          title={`${p.name} pen (${p.width}pt)`}
          onClick={() => {
            ui.setTool("pen");
            ui.setPen(p.color, p.width);
          }}
          className={`flex h-9 w-8 items-center justify-center rounded-md ${
            ui.tool === "pen" && ui.penColor === p.color ? "bg-slate-300 shadow-inner" : "hover:bg-slate-100"
          }`}
        >
          <span
            className="inline-block h-5 w-5 rounded-full border border-black/20"
            style={{ background: p.color }}
          />
        </button>
      ))}
      <span className="mx-1 h-6 w-px bg-slate-300" />
      {toolBtn("highlighter", "🖍", `Highlighter (${HIGHLIGHTER_WIDTH_PT}pt)`)}
      {toolBtn("eraser", "◨", `Eraser (${ERASER_RADIUS_PT}pt) — removes whole strokes`)}
      {toolBtn("text", "T", "Text box — tap a page to place")}
      {toolBtn("rect", "▭", "Rectangle")}
      <button
        data-tool="image"
        title="Insert image"
        onClick={() => fileRef.current?.click()}
        className="flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg hover:bg-slate-100"
      >
        🖼
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAddImage(f);
          e.target.value = "";
        }}
      />
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button
        data-action="undo"
        title="Undo (Ctrl+Z)"
        disabled={!history.canUndo()}
        onClick={() => void history.undo()}
        className="flex h-9 min-w-9 items-center justify-center rounded-md text-lg hover:bg-slate-100 disabled:opacity-30"
      >
        ↩
      </button>
      <button
        data-action="redo"
        title="Redo (Ctrl+Y)"
        disabled={!history.canRedo()}
        onClick={() => void history.redo()}
        className="flex h-9 min-w-9 items-center justify-center rounded-md text-lg hover:bg-slate-100 disabled:opacity-30"
      >
        ↪
      </button>
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button
        data-action="duplicate-page"
        title="Duplicate this page (instant)"
        onClick={onDuplicatePage}
        className="flex h-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
      >
        ⧉ Duplicate page
      </button>
    </div>
  );
}
