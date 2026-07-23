"use client";

import { useEffect, useRef, useState } from "react";
import { PEN_COLORS, HIGHLIGHTER_WIDTH_PT, ERASER_RADIUS_PT, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import { hasSelectionClipboard, onSelectionClipboardChange } from "@/lib/blocks/actions";
import type { ViewSettings } from "@/lib/planner/view-settings";
import { usePlannerUI } from "./ui-context";

/** Bottom toolbar: pens, highlighter, eraser, text, rect, image, undo/redo, duplicate. */
export default function Toolbar({
  onAddImage,
  onDuplicatePage,
  onAddPage,
  onOpenManage,
  onExport,
  onPasteSelection,
  viewSettings,
  onChangeViewSettings,
}: {
  onAddImage: (file: File) => void;
  onDuplicatePage: () => void;
  onAddPage: () => void;
  onOpenManage: () => void;
  onExport: (scope: "year" | "page") => void;
  onPasteSelection: () => void;
  viewSettings: ViewSettings;
  onChangeViewSettings: (s: ViewSettings) => void;
}) {
  const [viewMenu, setViewMenu] = useState(false);
  const ui = usePlannerUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  useEffect(() => history.onHistoryChange(() => force((n) => n + 1)), []);
  useEffect(() => onSelectionClipboardChange(() => force((n) => n + 1)), []);

  // Per-slot palette customization (Jo's colors are the defaults).
  const [palette, setPalette] = useState(PEN_COLORS);
  const [editSlot, setEditSlot] = useState<number | null>(null);
  // Popovers must be position:fixed — the toolbar's overflow-x-auto CLIPS
  // anything absolutely positioned above it (they'd open invisibly).
  const [editAnchor, setEditAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [viewAnchor, setViewAnchor] = useState<{ right: number; bottom: number } | null>(null);
  const anchorFor = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.min(Math.max(8, r.left + r.width / 2 - 88), window.innerWidth - 184),
      right: Math.max(8, window.innerWidth - r.right),
      bottom: window.innerHeight - r.top + 6,
    };
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jotter.palette");
      if (saved) {
        const rows = JSON.parse(saved) as { color: string; width: number }[];
        const merged = PEN_COLORS.map((p, i) => ({ ...p, ...rows[i] }));
        setPalette(merged);
        // Seed the shared pen state too, or the first stroke after a reload
        // draws in the factory default instead of the customized slot 1.
        ui.setPen(merged[0].color, merged[0].width);
      }
    } catch {
      // corrupted palette — defaults win
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const updateSlot = (i: number, patch: { color?: string; width?: number }) => {
    setPalette((prev) => {
      const next = prev.map((p, j) => (j === i ? { ...p, ...patch } : p));
      localStorage.setItem(
        "jotter.palette",
        JSON.stringify(next.map(({ color, width }) => ({ color, width })))
      );
      ui.setPen(next[i].color, next[i].width);
      return next;
    });
  };

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
    <div
      className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-t border-slate-300 bg-white px-2 shadow-[0_-2px_6px_rgba(0,0,0,0.08)]"
      style={{ touchAction: "manipulation" }}
    >
      {toolBtn("select", "🖐", "Move text & image boxes (touch: swipe to flip pages)")}
      {toolBtn("marquee", "⬚", "Select area — drag a box around ink & boxes to move, copy, or delete them")}
      <button
        data-action="paste-selection"
        title="Paste the cut/copied selection onto this page (Ctrl+V)"
        disabled={!hasSelectionClipboard()}
        onClick={onPasteSelection}
        className="flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg hover:bg-slate-100 disabled:opacity-30"
      >
        📋
      </button>
      <span className="mx-1 h-6 w-px bg-slate-300" />
      {palette.map((p, i) => {
        const active = ui.tool === "pen" && ui.penColor === p.color && ui.penWidth === p.width;
        return (
          <div key={p.name} className="relative">
            <button
              data-pen={p.name}
              title={`${p.name} (${p.width}pt) — tap again to change color/thickness`}
              onClick={(e) => {
                if (active) {
                  // second tap opens the color/thickness editor
                  if (editSlot === i) {
                    setEditSlot(null);
                  } else {
                    setEditAnchor(anchorFor(e.currentTarget));
                    setEditSlot(i);
                  }
                } else {
                  ui.setTool("pen");
                  ui.setPen(p.color, p.width);
                }
              }}
              className={`flex h-9 w-8 items-center justify-center rounded-md ${
                active ? "bg-slate-300 shadow-inner" : "hover:bg-slate-100"
              }`}
            >
              <span
                className="inline-block rounded-full border border-black/20"
                style={{
                  background: p.color,
                  width: `${14 + p.width * 4}px`,
                  height: `${14 + p.width * 4}px`,
                }}
              />
            </button>
            {editSlot === i && editAnchor && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  data-pen-editor-backdrop
                  onClick={() => setEditSlot(null)}
                />
                <div
                  data-pen-editor={p.name}
                  className="fixed z-40 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
                  style={{ left: editAnchor.left, bottom: editAnchor.bottom }}
                >
                <div className="mb-1 text-xs font-bold text-slate-600">{p.name}</div>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={p.color}
                    data-input="pen-color"
                    onChange={(e) => updateSlot(i, { color: e.target.value })}
                    className="h-7 w-10 cursor-pointer rounded border border-slate-300"
                  />
                  <span className="text-xs text-slate-500">{p.color}</span>
                </div>
                <label className="block text-xs text-slate-500">
                  Thickness: {p.width}pt
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.25}
                    value={p.width}
                    data-input="pen-width"
                    onChange={(e) => updateSlot(i, { width: Number(e.target.value) })}
                    className="w-full"
                  />
                </label>
                <div className="mt-1 flex justify-between">
                  <button
                    className="text-xs text-slate-500 underline"
                    onClick={() => updateSlot(i, { color: PEN_COLORS[i].color, width: PEN_COLORS[i].width })}
                  >
                    Reset
                  </button>
                  <button
                    className="text-xs font-semibold text-blue-600"
                    onClick={() => setEditSlot(null)}
                  >
                    Done
                  </button>
                </div>
                </div>
              </>
            )}
          </div>
        );
      })}
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
      <button
        data-action="add-page"
        title="Insert a new blank page after this one"
        onClick={onAddPage}
        className="flex h-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
      >
        ＋ Page
      </button>
      {/* zoom — app-level so the toolbar stays on screen */}
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button
        data-action="zoom-out"
        title="Zoom out"
        onClick={() =>
          onChangeViewSettings({ ...viewSettings, zoom: Math.max(0.5, Math.round((viewSettings.zoom - 0.25) * 4) / 4) })
        }
        className="flex h-9 min-w-8 items-center justify-center rounded-md text-lg hover:bg-slate-100"
      >
        −
      </button>
      <button
        data-action="zoom-reset"
        title="Reset zoom"
        onClick={() => onChangeViewSettings({ ...viewSettings, zoom: 1 })}
        className="flex h-9 items-center justify-center rounded-md px-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
      >
        {Math.round(viewSettings.zoom * 100)}%
      </button>
      <button
        data-action="zoom-in"
        title="Zoom in (toolbar stays visible)"
        onClick={() =>
          onChangeViewSettings({ ...viewSettings, zoom: Math.min(3, Math.round((viewSettings.zoom + 0.25) * 4) / 4) })
        }
        className="flex h-9 min-w-8 items-center justify-center rounded-md text-lg hover:bg-slate-100"
      >
        ＋
      </button>
      <div className="relative">
        <button
          data-action="view-menu"
          title="Layout options"
          onClick={(e) => {
            if (!viewMenu) setViewAnchor(anchorFor(e.currentTarget));
            setViewMenu((v) => !v);
          }}
          className="flex h-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
        >
          ⿹ View
        </button>
        {viewMenu && viewAnchor && (
          <>
            <div className="fixed inset-0 z-30" data-view-menu-backdrop onClick={() => setViewMenu(false)} />
            <div
              data-view-menu
              className="fixed z-40 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
              style={{ right: viewAnchor.right, bottom: viewAnchor.bottom }}
            >
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Page layout</div>
            {(
              [
                ["single", "Single Page (page by page)"],
                ["continuous", "Single Page Continuous"],
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="radio"
                  name="layout"
                  data-layout-option={val}
                  checked={viewSettings.layout === val}
                  onChange={() => onChangeViewSettings({ ...viewSettings, layout: val })}
                />
                {label}
              </label>
            ))}
            <div className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Page view</div>
            {(
              [
                ["fit-page", "Fit to Page"],
                ["fit-width", "Fit to Width"],
                ["fit-height", "Fit to Height"],
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="radio"
                  name="view"
                  data-view-option={val}
                  checked={viewSettings.view === val}
                  onChange={() => onChangeViewSettings({ ...viewSettings, view: val, zoom: 1 })}
                />
                {label}
              </label>
            ))}
            <div className="mt-2 text-right">
              <button className="text-xs font-semibold text-blue-600" onClick={() => setViewMenu(false)}>
                Done
              </button>
            </div>
            </div>
          </>
        )}
      </div>
      <button
        data-action="export-page"
        title="Export this page to PDF"
        onClick={() => onExport("page")}
        className="ml-auto flex h-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
      >
        ⬇ Page PDF
      </button>
      <button
        data-action="export-year"
        title="Export the full year to a hyperlinked PDF"
        onClick={() => onExport("year")}
        className="flex h-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
      >
        ⬇ Year PDF
      </button>
      <button
        data-action="open-manage"
        title="Habits & categories"
        onClick={onOpenManage}
        className="flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg hover:bg-slate-100"
      >
        ⚙
      </button>
    </div>
  );
}
