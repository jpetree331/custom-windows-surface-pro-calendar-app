"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db/db";

const PLANNER_YEAR = 2026;

/** Phase 0 placeholder — proves the local-first stack boots. */
export default function Home() {
  const [status, setStatus] = useState<string>("Opening local database…");

  useEffect(() => {
    (async () => {
      try {
        let planner = await db.planners.where("year").equals(PLANNER_YEAR).first();
        if (!planner) {
          planner = {
            id: crypto.randomUUID(),
            year: PLANNER_YEAR,
            title: `Jo's Planner '${String(PLANNER_YEAR).slice(2)}`,
            settings: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await db.planners.add(planner);
        }
        setStatus(`Local database ready — planner "${planner.title}" loaded.`);
      } catch (err) {
        setStatus(`Local database FAILED: ${String(err)}`);
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight text-slate-800">
        Jo&apos;s Planner
      </h1>
      <p className="text-slate-600">{status}</p>
      <p className="text-sm text-slate-500">
        Phase 0 skeleton — the planner spine arrives in Phase 1.
      </p>
    </main>
  );
}
