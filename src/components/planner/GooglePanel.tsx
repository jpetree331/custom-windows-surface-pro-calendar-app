"use client";

import { useState } from "react";
import { getAccessToken, googleClientId } from "@/lib/google/auth";
import { insertEvent } from "@/lib/google/api";
import { importYear } from "@/lib/google/import";
import { PLANNER_YEAR } from "@/lib/planner/constants";

/** Google Calendar section of the settings dialog: connect, sync, invite. */
export default function GooglePanel({ plannerId }: { plannerId: string }) {
  const [status, setStatus] = useState<string>(
    googleClientId() ? "Not synced this session." : "Not configured — see docs/google-setup.md."
  );
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attendee, setAttendee] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);

  const syncNow = async () => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const r = await importYear(plannerId, PLANNER_YEAR, token);
      setStatus(`Imported ${r.total} events (${r.added} new, ${r.updated} refreshed).`);
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
