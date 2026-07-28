"use client";

import { useEffect, useState } from "react";
import { PEN_COLORS, HIGHLIGHTER_WIDTH_PT, ERASER_RADIUS_PT, type ToolId } from "@/lib/ink/tools";
import * as history from "@/lib/history";
import type { ViewSettings } from "@/lib/planner/view-settings";
import { usePlannerUI } from "./ui-context";

export interface ExportRequest {
  scope: "page" | "year" | "range";
  fromIndex?: number;
  toIndex?: number;
}

/**
 * Color + thickness editor popover, shared by pen slots and the shape tools.
 * "Previous color" restores the snapshot taken when the popover opened —
 * Jo's "revert my last change" (she doesn't want factory reset).
 */
function ColorWidthEditor({
  name,
  color,
  width,
  anchor,
  onColor,
  onWidth,
  onPrevious,
  onClose,
}: {
  name: string;
  color: string;
  width: number;
  anchor: { left: number; bottom: number };
  onColor: (c: string) => void;
  onWidth: (w: number) => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const [hexDraft, setHexDraft] = useState(color);
  // keep the hex field in step when the native picker changes the color
  useEffect(() => setHexDraft(color), [color]);
  return (
    <>
      <div className="fixed inset-0 z-30" data-pen-editor-backdrop onClick={onClose} />
      <div
        data-pen-editor={name}
        className="fixed z-40 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
        style={{ left: anchor.left, bottom: anchor.bottom }}
      >
        <div className="mb-1 text-xs font-bold text-slate-600">{name}</div>
        <div className="mb-2 flex items-center gap-2">
          <input
            type="color"
            value={color}
            data-input="pen-color"
            onChange={(e) => onColor(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-slate-300"
          />
          <input
            type="text"
            value={hexDraft}
            data-input="pen-hex"
            maxLength={7}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              setHexDraft(v);
              if (/^#[0-9a-fA-F]{6}$/.test(v)) onColor(v);
            }}
            className="w-20 rounded border border-slate-300 px-1 py-0.5 font-mono text-xs"
          />
        </div>
        <label className="block text-xs text-slate-500">
          Thickness: {width}pt
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.25}
            value={width}
            data-input="pen-width"
            onChange={(e) => onWidth(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <div className="mt-1 flex justify-between">
          <button
            data-action="pen-previous"
            title="Back to the color this had when you opened the editor"
            className="text-xs text-slate-500 underline"
            onClick={onPrevious}
          >
            Previous color
          </button>
          <button className="text-xs font-semibold text-blue-600" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}

/** Bottom toolbar: pens, tools, undo/redo, zoom, PDF export, settings. */
export default function Toolbar({
  onOpenManage,
  onExport,
  viewSettings,
  onChangeViewSettings,
  pageCount,
  currentPageIndex,
  onFlip,
}: {
  onOpenManage: () => void;
  onExport: (req: ExportRequest) => void;
  viewSettings: ViewSettings;
  onChangeViewSettings: (s: ViewSettings) => void;
  pageCount: number;
  currentPageIndex: number;
  onFlip: (dir: 1 | -1) => void;
}) {
  const ui = usePlannerUI();
  const [, force] = useState(0);
  useEffect(() => history.onHistoryChange(() => force((n) => n + 1)), []);

  // Per-slot palette customization (Jo's colors are the defaults).
  const [palette, setPalette] = useState(PEN_COLORS);
  // number = pen slot; "rect"/"circle" = the shared shape color/width editor
  const [editSlot, setEditSlot] = useState<number | "rect" | "circle" | null>(null);
  const [openSnapshot, setOpenSnapshot] = useState<{ color: string; width: number } | null>(null);
  // Popovers must be position:fixed — the toolbar's overflow CLIPS anything
  // absolutely positioned above it (they'd open invisibly).
  const [editAnchor, setEditAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<{ right: number; bottom: number } | null>(null);
  const [exportScope, setExportScope] = useState<"page" | "range" | "year">("page");
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const anchorFor = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.min(Math.max(8, r.left + r.width / 2 - 88), window.innerWidth - 200),
      right: Math.max(8, window.innerWidth - r.right),
      bottom: window.innerHeight - r.top + 6,
    };
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jotter.palette");
      if (saved) {
        const rows = JSON.parse(saved) as { color: string; width: number }[];
        // Length-agnostic merge: a legacy 7-slot save leaves the new 8th slot
        // at its factory default ({...p, ...undefined} is a no-op spread).
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
    // NOT inside the setPalette updater: updaters run during render, and
    // calling ui.setPen there is a cross-component setState-in-render.
    const next = palette.map((p, j) => (j === i ? { ...p, ...patch } : p));
    localStorage.setItem(
      "jotter.palette",
      JSON.stringify(next.map(({ color, width }) => ({ color, width })))
    );
    setPalette(next);
    ui.setPen(next[i].color, next[i].width);
  };
  const closeEditor = () => {
    setEditSlot(null);
    setOpenSnapshot(null);
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

  /** Shape buttons: tap = pick the tool; tap again = edit its color/width
   *  (bound to the shared pen state, so shapes follow the active pen). */
  const shapeBtn = (tool: "rect" | "circle", label: string, title: string) => (
    <button
      key={tool}
      data-tool={tool}
      title={`${title} — tap again to change color/thickness`}
      onClick={(e) => {
        if (ui.tool === tool) {
          if (editSlot === tool) {
            closeEditor();
          } else {
            setEditAnchor(anchorFor(e.currentTarget));
            setOpenSnapshot({ color: ui.penColor, width: ui.penWidth });
            setEditSlot(tool);
          }
        } else {
          ui.setTool(tool);
        }
      }}
      className={`flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg ${
        ui.tool === tool ? "bg-slate-300 shadow-inner" : "hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      // flex-wrap: in portrait the tools flow onto a second VISIBLE row
      // instead of clipping inside a fixed-height scroller
      className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-t border-slate-300 bg-white px-2 py-0.5 shadow-[0_-2px_6px_rgba(0,0,0,0.08)] print:hidden"
      style={{ touchAction: "manipulation" }}
    >
      {/* Jo's order: pens first (leftmost), then tools */}
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
                    closeEditor();
                  } else {
                    setEditAnchor(anchorFor(e.currentTarget));
                    setOpenSnapshot({ color: p.color, width: p.width });
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
              <ColorWidthEditor
                name={p.name}
                color={p.color}
                width={p.width}
                anchor={editAnchor}
                onColor={(c) => updateSlot(i, { color: c })}
                onWidth={(w) => updateSlot(i, { width: w })}
                onPrevious={() => openSnapshot && updateSlot(i, openSnapshot)}
                onClose={closeEditor}
              />
            )}
          </div>
        );
      })}
      <span className="mx-1 h-6 w-px bg-slate-300" />
      {toolBtn("highlighter", "🖍", `Highlighter (${HIGHLIGHTER_WIDTH_PT}pt)`)}
      {toolBtn("eraser", "◨", `Eraser (${ERASER_RADIUS_PT}pt) — removes whole strokes`)}
      {toolBtn("text", "T", "Text box — tap a page to place")}
      {shapeBtn("rect", "▭", "Rectangle — uses the active pen color")}
      {shapeBtn("circle", "◯", "Circle / oval — uses the active pen color")}
      {(editSlot === "rect" || editSlot === "circle") && editAnchor && (
        <ColorWidthEditor
          name={editSlot === "rect" ? "Rectangle" : "Circle"}
          color={ui.penColor}
          width={ui.penWidth}
          anchor={editAnchor}
          onColor={(c) => ui.setPen(c, ui.penWidth)}
          onWidth={(w) => ui.setPen(ui.penColor, w)}
          onPrevious={() => openSnapshot && ui.setPen(openSnapshot.color, openSnapshot.width)}
          onClose={closeEditor}
        />
      )}
      {toolBtn("select", "🖐", "Move text & image boxes (touch: swipe to flip pages)")}
      {toolBtn("marquee", "⬚", "Select area — drag a box (or tap an item) to move, copy, or delete")}
      {toolBtn("lasso", "➰", "Lasso select — draw around exactly what you want")}
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
      {/* page flip + counter — lived over the page bottom, now here (Jo) */}
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button
        data-flip="prev"
        title="Previous page (PageUp)"
        disabled={currentPageIndex <= 1}
        onClick={() => onFlip(-1)}
        className="flex h-9 min-w-8 items-center justify-center rounded-md text-lg font-bold hover:bg-slate-100 disabled:opacity-30"
      >
        ‹
      </button>
      <span data-page-counter className="whitespace-nowrap text-xs font-semibold text-slate-600">
        {currentPageIndex} / {pageCount}
      </span>
      <button
        data-flip="next"
        title="Next page (PageDown)"
        disabled={currentPageIndex >= pageCount}
        onClick={() => onFlip(1)}
        className="flex h-9 min-w-8 items-center justify-center rounded-md text-lg font-bold hover:bg-slate-100 disabled:opacity-30"
      >
        ›
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
      <div className="relative ml-auto">
        <button
          data-action="export-pdf"
          title="Download PDF — current page, a range, or the whole year"
          onClick={(e) => {
            if (!exportMenu) {
              setExportAnchor(anchorFor(e.currentTarget));
              setRangeFrom(currentPageIndex);
              setRangeTo(currentPageIndex);
            }
            setExportMenu((v) => !v);
          }}
          className="flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-sm font-semibold hover:bg-slate-100"
        >
          ⬇ PDF
        </button>
        {exportMenu && exportAnchor && (
          <>
            <div className="fixed inset-0 z-30" data-export-menu-backdrop onClick={() => setExportMenu(false)} />
            <div
              data-export-menu
              className="fixed z-40 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              style={{ right: exportAnchor.right, bottom: exportAnchor.bottom }}
            >
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Download PDF</div>
              {(
                [
                  ["page", "Current page"],
                  ["range", "Page range"],
                  ["year", "Whole year (with links)"],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="radio"
                    name="exportScope"
                    data-export-option={val}
                    checked={exportScope === val}
                    onChange={() => setExportScope(val)}
                  />
                  {label}
                  {val === "range" && (
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="number"
                        min={1}
                        max={pageCount}
                        value={rangeFrom}
                        data-export-range="from"
                        disabled={exportScope !== "range"}
                        onChange={(e) => setRangeFrom(Number(e.target.value))}
                        className="w-12 rounded border border-slate-300 px-1 py-0.5 disabled:opacity-40"
                      />
                      –
                      <input
                        type="number"
                        min={1}
                        max={pageCount}
                        value={rangeTo}
                        data-export-range="to"
                        disabled={exportScope !== "range"}
                        onChange={(e) => setRangeTo(Number(e.target.value))}
                        className="w-12 rounded border border-slate-300 px-1 py-0.5 disabled:opacity-40"
                      />
                    </span>
                  )}
                </label>
              ))}
              <div className="mt-2 text-right">
                <button
                  data-action="export-go"
                  className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
                  onClick={() => {
                    setExportMenu(false);
                    if (exportScope === "range") {
                      const lo = Math.max(1, Math.min(rangeFrom, rangeTo));
                      const hi = Math.min(pageCount, Math.max(rangeFrom, rangeTo));
                      onExport({ scope: "range", fromIndex: lo - 1, toIndex: hi - 1 });
                    } else {
                      onExport({ scope: exportScope });
                    }
                  }}
                >
                  Download
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <button
        data-action="open-manage"
        title="Settings — habits, categories, view, Google"
        onClick={onOpenManage}
        className="flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-lg hover:bg-slate-100"
      >
        ⚙
      </button>
    </div>
  );
}
