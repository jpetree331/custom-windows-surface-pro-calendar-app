# Phase 0 Report — Recon & Scaffold

*Executor: Claude Code · Date: 2026-07-08*

## What was built

- **Recon design doc** ([docs/recon/phase-0-recon.md](../recon/phase-0-recon.md)):
  79-page inventory, full Dexie + Supabase data model with sync mapping,
  live-verified dependency versions, risk list.
- **Next.js 16.2 (App Router) + TypeScript (strict) + Tailwind v4** scaffold at repo
  root; `npm run dev` boots to a placeholder page.
- **Dexie schema v1** (`src/lib/db/db.ts`): planners, pages, strokes, blocks,
  habits, habitChecks, categories, events, syncQueue — UUID keys shared with cloud.
- **Supabase**: lazy client that returns `null` without env vars (offline-first),
  full SQL migration (`supabase/migrations/0001_init.sql`) with owner-scoped RLS on
  all 8 tables + a private storage bucket policy, and an automated cross-owner RLS
  test (`npm run test:rls`).
- **Sync stub** (`src/lib/sync/index.ts`): `queueSync()` records mutations;
  `sync()` is a documented no-op for now.
- **PWA**: `manifest.webmanifest` (via `app/manifest.ts`), offline-capable service
  worker (`public/sw.js`), generated 192/512 icons in the planner palette
  (zero-dependency PNG encoder in `scripts/gen-icons.mjs`).
- **Env template** (`.env.example`), README, this report.

## Verify checklist

| Item | Result | Evidence |
|---|---|---|
| App boots | **PASS** | `npm run build` clean; dev server renders "Jo's Planner / Local database ready" |
| PWA installable in Edge | **PASS (criteria)** | manifest served (`standalone`, name, 192+512 png icons) and service worker registered + **activated** — verified live in the preview browser. These are Edge's installability criteria; the actual install prompt needs a human Edge session (headless preview can't show it). |
| Dexie DB initializes | **PASS** | IndexedDB `jotter` database exists; planner row "Jo's Planner '26" created on first run |
| Supabase connects + RLS denies cross-owner reads | **DEFERRED** | No Supabase credentials exist in this environment. Delivered instead: migration with `owner_all` RLS policies on every table + automated proof script `npm run test:rls` (signs in as user A, inserts; signs in as user B, expects 0 rows on read and 0 rows on update). Run it once a project is provisioned. |
| Data-sovereignty | **PASS** | All user content lives in local IndexedDB; Supabase client is null unless Jo's own project env vars are set; zero third-party calls in the codebase. |

## Deviations from the plan

1. **Supabase live verification deferred** — no credentials available to the
   executor. Schema, RLS, and an automated test are shipped; one manual step
   remains (create project → run migration → `npm run test:rls`).
2. **TypeScript pinned to 5.9**, not latest (6.0.3), for Next 16 compatibility.
3. **App lives at repo root** (not a subfolder) for clean Vercel deployment; the
   plan document and screenshots moved to `docs/`.
4. **53 weekly spreads, not 52** (2026 spans 53 Monday-start weeks) — see recon
   doc; keeps every date reachable and totals exactly 79 pages.
