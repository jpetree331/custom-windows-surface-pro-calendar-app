"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { addHabit, deleteHabit, renameHabit, setHabitCadence } from "@/lib/habits/actions";
import { addCategory, deleteCategory, updateCategory } from "@/lib/categories/actions";
import SideButtonEditor from "./SideButtonEditor";
import GooglePanel from "./GooglePanel";
import BackupPanel from "./BackupPanel";
import { usePlannerUI } from "./ui-context";
import { useEffect } from "react";
import { chooseSaveFolder, clearSaveFolder, folderPickingSupported, getSaveFolderName } from "@/lib/save";
import type { ViewSettings } from "@/lib/planner/view-settings";

/** Collapsible section (Jo: accordions for the long lists). */
function Accordion({
  title,
  name,
  defaultOpen = false,
  children,
}: {
  title: string;
  name: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3" data-accordion={name} data-open={open || undefined}>
      <button
        type="button"
        data-accordion-toggle={name}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-1 py-1 text-sm font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
      >
        {title}
        <span className="text-base leading-none text-slate-400">{open ? "︿" : "﹀"}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

/** Settings dialog: view, habits, categories, Google, backups. */
export default function ManageDialog({
  plannerId,
  year,
  onClose,
  viewSettings,
  onChangeViewSettings,
  focusSection = null,
}: {
  plannerId: string;
  year: number;
  onClose: () => void;
  viewSettings: ViewSettings;
  onChangeViewSettings: (s: ViewSettings) => void;
  /** Open with this accordion expanded + scrolled into view. */
  focusSection?: "side-buttons" | null;
}) {
  const habits = useLiveQuery(
    () => db.habits.where("plannerId").equals(plannerId).sortBy("order"),
    [plannerId]
  );
  const categories = useLiveQuery(
    () => db.categories.where("plannerId").equals(plannerId).sortBy("order"),
    [plannerId]
  );
  const [newHabit, setNewHabit] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3fa9f5");
  const ui = usePlannerUI();
  const [saveFolder, setSaveFolder] = useState<string | null>(null);
  useEffect(() => {
    void getSaveFolderName().then(setSaveFolder);
  }, []);
  // right-clicking the side menu lands here — bring its section into view
  useEffect(() => {
    if (!focusSection) return;
    document
      .querySelector(`[data-accordion="${focusSection}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusSection]);

  return (
    <div
      // z-band 3200: Settings must cover floating notes (≤2600, Jo r11)
      className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/40 p-4"
      data-manage-dialog
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Planner settings</h2>
          <button onClick={onClose} className="rounded px-2 text-xl hover:bg-slate-100" data-action="close-manage">
            ×
          </button>
        </div>

        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Time format</h3>
        <div className="mb-3 flex gap-4" data-time-format>
          {(
            [
              ["12h", "AM / PM (2:00 PM)"],
              ["24h", "24-hour (14:00)"],
            ] as const
          ).map(([val, label]) => (
            <label key={val} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="timeFormat"
                data-time-format-option={val}
                checked={ui.timeFormat === val}
                onChange={() => ui.setTimeFormat(val)}
              />
              {label}
            </label>
          ))}
        </div>

        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">View</h3>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1" data-view-section>
          <div>
            <div className="text-xs font-semibold text-slate-500">Page layout</div>
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
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Page view</div>
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
          </div>
        </div>

        {folderPickingSupported() && (
          <>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Save location</h3>
            <div className="mb-3 flex items-center gap-2 text-sm" data-save-location>
              <span className="text-slate-600">
                PDFs &amp; backups go to:{" "}
                <span className="font-semibold" data-save-folder-name>
                  {saveFolder ? `📁 ${saveFolder}` : "browser Downloads"}
                </span>
              </span>
              <button
                data-action="choose-folder"
                className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void chooseSaveFolder().then((name) => name && setSaveFolder(name))}
              >
                Choose folder…
              </button>
              {saveFolder && (
                <button
                  data-action="clear-folder"
                  className="text-xs text-slate-500 underline"
                  onClick={() => {
                    void clearSaveFolder();
                    setSaveFolder(null);
                  }}
                >
                  Use Downloads instead
                </button>
              )}
            </div>
          </>
        )}

        <Accordion title="Habits" name="habits">
        <div className="mb-2 space-y-1">
          {(habits ?? []).map((h) => (
            <div key={h.id} className="flex items-center gap-2" data-manage-habit={h.name}>
              <input
                defaultValue={h.name}
                onBlur={(e) => e.target.value !== h.name && void renameHabit(h.id, e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <select
                value={h.cadence}
                onChange={(e) => void setHabitCadence(h.id, e.target.value as "daily" | "weekly")}
                className="rounded border border-slate-300 px-1 py-1 text-sm"
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
              <button
                onClick={() => void deleteHabit(h.id)}
                className="rounded px-1.5 text-red-600 hover:bg-red-50"
                title="Delete habit"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newHabit.trim()) {
              void addHabit(plannerId, newHabit.trim(), "daily");
              setNewHabit("");
            }
          }}
        >
          <input
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            placeholder="New habit…"
            data-input="new-habit"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
            Add
          </button>
        </form>
        </Accordion>

        <Accordion title="Categories" name="categories">
        <div className="mb-2 space-y-1">
          {(categories ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2" data-manage-category={c.name}>
              <input
                type="color"
                value={c.color}
                onChange={(e) => void updateCategory(c.id, { color: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-slate-300"
                title="Recolor"
              />
              <input
                defaultValue={c.name}
                onBlur={(e) => e.target.value !== c.name && void updateCategory(c.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => void deleteCategory(c.id)}
                className="rounded px-1.5 text-red-600 hover:bg-red-50"
                title="Delete category (untags its items)"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCat.trim()) {
              void addCategory(plannerId, newCat.trim(), newCatColor);
              setNewCat("");
            }
          }}
        >
          <input
            type="color"
            value={newCatColor}
            onChange={(e) => setNewCatColor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-slate-300"
          />
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category…"
            data-input="new-category"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
            Add
          </button>
        </form>
        </Accordion>

        <Accordion title="Side buttons" name="side-buttons" defaultOpen={focusSection === "side-buttons"}>
        <SideButtonEditor plannerId={plannerId} />
        </Accordion>

        <GooglePanel plannerId={plannerId} year={year} />
        <BackupPanel />
      </div>
    </div>
  );
}
