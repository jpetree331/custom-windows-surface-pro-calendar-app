"use client";

import { useEffect, useState } from "react";
import { getAccessToken, googleClientId } from "@/lib/google/auth";
import { insertEvent, listCalendars, type GCalendar } from "@/lib/google/api";
import {
  deleteEvents,
  deleteEventsFromCalendars,
  findImportedByTitle,
  getGoogleCalendarIds,
  importYear,
  setGoogleCalendarIds,
  type ImportResult,
} from "@/lib/google/import";
import type { PlannerEvent } from "@/lib/db/types";
import {
  getAutoSyncInterval,
  lastAutoSyncAt,
  onAutoSync,
  recordManualSync,
  setAutoSyncInterval,
  type AutoSyncInterval,
} from "@/lib/google/autosync";

const AUTO_SYNC_CHOICES: { value: AutoSyncInterval; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "1h", label: "Hourly" },
  { value: "12h", label: "Every 12h" },
  { value: "24h", label: "Every 24h" },
];

function importSummary(r: ImportResult): string {
  const parts = [
    `Imported ${r.total} items from ${r.calendars} calendar${r.calendars === 1 ? "" : "s"}`,
    `(${r.added} new, ${r.updated} refreshed${r.tasks ? `, ${r.tasks} Google Tasks` : ""}${
      r.notices ? `, ${r.notices} reminder chips` : ""
    }).`,
  ];
  if (r.moonPurged) parts.push(`Removed ${r.moonPurged} moon-phase item(s).`);
  if (r.warnings.length > 0) parts.push(`⚠ ${r.warnings.join(" ")}`);
  return parts.join(" ");
}

/** Google Calendar section of the settings dialog: connect, sync, invite. */
export default function GooglePanel({ plannerId, year }: { plannerId: string; year: number }) {
  const [status, setStatus] = useState<string>(
    googleClientId() ? "Not synced this session." : "Not configured — see docs/google-setup.md."
  );
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attendee, setAttendee] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [autoSync, setAutoSync] = useState<AutoSyncInterval>("off");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [calendars, setCalendars] = useState<GCalendar[] | null>(null);
  const [chosenIds, setChosenIds] = useState<string[] | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  // Manual cleanup (Jo r12): pattern-matching a calendar's title style is a
  // guess, so let her SEE what would go and press the button herself.
  const [cleanupTerm, setCleanupTerm] = useState("moon");
  const [cleanupHits, setCleanupHits] = useState<PlannerEvent[] | null>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);

  // Lazy-loaded on demand — opening settings must never pop a Google window.
  const loadCalendars = async () => {
    setCalBusy(true);
    try {
      const token = await getAccessToken();
      const all = await listCalendars(token);
      setCalendars(all);
      const saved = await getGoogleCalendarIds(plannerId);
      setChosenIds(saved ?? all.filter((c) => c.primary || c.selected).map((c) => c.id));
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    } finally {
      setCalBusy(false);
    }
  };

  const toggleCalendar = (id: string) => {
    if (!chosenIds) return;
    const removing = chosenIds.includes(id);
    const next = removing ? chosenIds.filter((c) => c !== id) : [...chosenIds, id];
    setChosenIds(next);
    void setGoogleCalendarIds(plannerId, next);
    // Unchecking now REMOVES that calendar's items instead of leaving them
    // stranded on the pages forever (Jo r12).
    if (removing) {
      void deleteEventsFromCalendars(plannerId, [id]).then((n) => {
        setStatus(
          n > 0
            ? `Removed ${n} item(s) that came from that calendar.`
            : // Rows imported before this update carry no calendar tag; one
              // sync re-tags them, or she can clear them by name right here.
              "That calendar won't import again. Anything it added earlier can be cleared with “Remove imported items by name” below (or sync once, then uncheck it again)."
        );
      });
    }
  };

  const runCleanupSearch = async () => {
    setCleanupConfirm(false);
    setCleanupHits(await findImportedByTitle(plannerId, cleanupTerm));
  };

  useEffect(() => {
    setAutoSync(getAutoSyncInterval());
    setLastSync(lastAutoSyncAt(plannerId));
    // live update if a background sync completes while the dialog is open
    return onAutoSync((r, at) => {
      setLastSync(at);
      setStatus(`Auto-synced: ${importSummary(r)}`);
    });
  }, [plannerId]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await importYear(plannerId, year, token);
      recordManualSync(plannerId); // resets the auto-sync clock too
      setLastSync(lastAutoSyncAt(plannerId));
      setStatus(importSummary(r));
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const allDay = !time;
      const startISO = allDay ? undefined : `${date}T${time}:00`;
      const endDt = allDay ? null : new Date(`${date}T${time}:00`);
      if (endDt) endDt.setHours(endDt.getHours() + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      const endISO = endDt
        ? `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}T${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:00`
        : undefined;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await insertEvent(token, {
        summary: title.trim(),
        start: allDay ? { date } : { dateTime: startISO, timeZone: tz },
        end: allDay ? { date } : { dateTime: endISO, timeZone: tz },
        recurrence: repeatWeekly ? ["RRULE:FREQ=WEEKLY"] : undefined,
        attendees: attendee.trim() ? [{ email: attendee.trim() }] : undefined,
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
      });
      setTitle(""); setAttendee(""); setRepeatWeekly(false);
      await syncNow();
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-200 pt-3" data-google-panel>
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        Google Calendar
      </h3>
      <p className="mb-2 text-xs text-slate-500" data-google-status>{status}</p>
      <button
        onClick={() => void syncNow()}
        disabled={busy || !googleClientId()}
        data-action="google-sync"
        className="mb-3 rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Working…" : "Connect & sync now"}
      </button>
      {googleClientId() && (
        <div className="mb-3" data-auto-sync>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-600">Auto-sync:</span>
            {AUTO_SYNC_CHOICES.map((c) => (
              <label key={c.value} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="autoSync"
                  data-auto-sync-option={c.value}
                  checked={autoSync === c.value}
                  onChange={() => {
                    setAutoSyncInterval(c.value);
                    setAutoSync(c.value);
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {lastSync && (
              <span data-last-sync>Last synced {new Date(lastSync).toLocaleString()}. </span>
            )}
            Runs in the background while the app is open; a small Google window may
            flash briefly when it refreshes access.
          </p>
        </div>
      )}
      {googleClientId() && (
        <div className="mb-3" data-calendar-checklist>
          {!calendars ? (
            <button
              onClick={() => void loadCalendars()}
              disabled={calBusy}
              data-action="choose-calendars"
              className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              {calBusy ? "Loading…" : "Choose which calendars import…"}
            </button>
          ) : (
            <>
              <p className="mb-1 text-xs font-semibold text-slate-600">
                Calendars to import (uncheck “Phases of the Moon” etc.):
              </p>
              <div className="max-h-36 overflow-y-auto rounded border border-slate-200 p-1.5">
                {calendars.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      data-google-calendar-checkbox={c.id}
                      checked={chosenIds?.includes(c.id) ?? false}
                      onChange={() => toggleCalendar(c.id)}
                    />
                    <span className="truncate">
                      {c.summary ?? c.id}
                      {c.primary ? " (main)" : ""}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Unchecking a calendar stops it importing and removes the items
                it added (items from before this update clear after one sync).
              </p>
            </>
          )}
        </div>
      )}
      {/* Manual cleanup: works whatever a calendar names its events, and
          shows Jo exactly what it found before anything is deleted (r12). */}
      <div className="mb-3" data-cleanup-imported>
        <p className="mb-1 text-xs font-semibold text-slate-600">
          Remove imported items by name
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={cleanupTerm}
            onChange={(e) => {
              setCleanupTerm(e.target.value);
              setCleanupHits(null);
            }}
            data-input="cleanup-term"
            placeholder="moon"
            className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            data-action="cleanup-find"
            onClick={() => void runCleanupSearch()}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Find
          </button>
          {cleanupHits && cleanupHits.length > 0 && !cleanupConfirm && (
            <button
              data-action="cleanup-delete"
              onClick={() => setCleanupConfirm(true)}
              className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
            >
              Delete {cleanupHits.length}
            </button>
          )}
          {cleanupHits && cleanupHits.length > 0 && cleanupConfirm && (
            <>
              {/* deleting events isn't undoable, and a name search can match a
                  real event ("Full Moon party") — so confirm, like elsewhere */}
              <button
                data-action="cleanup-delete-confirm"
                onClick={() =>
                  void deleteEvents(cleanupHits.map((e) => e.id)).then((n) => {
                    setStatus(`Removed ${n} imported item(s).`);
                    setCleanupHits([]);
                    setCleanupConfirm(false);
                  })
                }
                className="rounded bg-red-600 px-2 py-1 text-xs font-bold text-white"
              >
                Delete {cleanupHits.length} for good
              </button>
              <button
                className="text-xs text-slate-500 underline"
                onClick={() => setCleanupConfirm(false)}
              >
                Keep
              </button>
            </>
          )}
        </div>
        {cleanupHits && (
          <p className="mt-1 text-xs text-slate-500" data-cleanup-result>
            {cleanupHits.length === 0
              ? "Nothing imported matches that word."
              : `Will delete: ${[...new Set(cleanupHits.map((e) => e.title))].slice(0, 6).join(", ")}${
                  cleanupHits.length > 6 ? " …" : ""
                }`}
          </p>
        )}
      </div>
      <form onSubmit={createEvent} className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-600">New Google event (+ invite a contact)</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title…"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm" />
        </div>
        <input
          value={attendee}
          onChange={(e) => setAttendee(e.target.value)}
          placeholder="Attendee email (optional — sends an invite)"
          type="email"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} />
          Repeat weekly
        </label>
        <button
          type="submit"
          disabled={busy || !googleClientId()}
          className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
        >
          Create in Google
        </button>
      </form>
    </div>
  );
}
