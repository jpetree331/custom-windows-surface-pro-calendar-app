"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { addHabit, deleteHabit, renameHabit, setHabitCadence } from "@/lib/habits/actions";
import { addCategory, deleteCategory, updateCategory } from "@/lib/categories/actions";

/** Settings dialog: manage habits (daily/weekly) and color categories. */
export default function ManageDialog({
  plannerId,
  onClose,
}: {
  plannerId: string;
  onClose: () => void;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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

        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Habits</h3>
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

        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Categories</h3>
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
      </div>
    </div>
  );
}
