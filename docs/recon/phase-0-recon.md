# Phase 0 Recon — `jotter` Design Doc

*Executor: Claude Code. Date: 2026-07-08.*

## 1. Page inventory (79 pages, planner year 2026)

Ordering mirrors a physical planner: year overview, then each month page followed by
its weekly spreads, then section pages at the back.

| # | Type | Count | Data needed |
|---|------|-------|-------------|
| 1 | **YEAR** | 1 | year number, 12 mini month grids (day-of-week layout per month) |
| 2 | **MONTH** | 12 | month name, day grid (Mon-start), date numbers, holiday/moon overlay slots |
| 3 | **WEEK** | 53 | Mon–Sun dates + day numbers, month tag, TASKS region, CLEANING region, HABITS grid (rows × Mon–Sun) |
| 4 | **SECTION/NOTES** | 13 | section label, freeform note surface |

**Week count deviation:** the plan says "52 weekly spreads," but 2026 begins on a
Thursday, so 53 Monday-start weeks overlap the calendar year (Mon Dec 29 2025 →
Sun Jan 3 2027 coverage). We generate every week that overlaps 2026 = **53 weeks**,
so no date is unreachable. 1 + 12 + 53 + 13 = **79 pages** — exactly the Drawboard
page count.

A week belongs to the month containing its **Thursday** (ISO-style), which decides
where it sits in the month-interleaved scroll order and which month tab highlights.

**Section pages (13)** — derived from the side-tab strip visible in `image.png`
(Jo's current planner) reduced to the Gate-C button set plus the most-used tabs:
TO DO ×2, CLEAN & ORGANIZE ×1, BUSINESS ×3, NOTES ×4, BIRTHDAYS ×1, HOLIDAYS ×1,
SHOPPING ×1. Labels are data, not code — trivially renameable later.

## 2. Data model

### Dexie (IndexedDB) — on-device source of truth

| Store | Key | Indexes | Fields |
|-------|-----|---------|--------|
| `planners` | `id` | `year` | id, year, title, settings(JSON), createdAt, updatedAt |
| `pages` | `id` | `plannerId`, `[plannerId+index]`, `type` | id, plannerId, type(year\|month\|week\|section), index, label, monthIndex, dateStart, dateEnd, meta(JSON), updatedAt |
| `strokes` | `id` | `pageId` | id, pageId, tool, color, width, opacity, points([[x,y,pressure]…]), createdAt |
| `blocks` | `id` | `pageId` | id, pageId, type(text\|image\|task), x, y, w, h, rotation, z, content, imageBlob, checked, categoryId, createdAt, updatedAt |
| `habits` | `id` | `plannerId` | id, plannerId, name, cadence(daily\|weekly), order, active |
| `habitChecks` | `id` | `[habitId+date]` | id, habitId, date(YYYY-MM-DD), checked |
| `categories` | `id` | `plannerId` | id, plannerId, name, color, order |
| `events` | `id` | `plannerId`, `date`, `googleId` | id, plannerId, googleId, kind(event\|birthday\|reminder), title, date, startTime, endTime, allDay, rrule, categoryId, updatedAt |
| `syncQueue` | `++seq` | `table` | seq, table, rowId, op(put\|delete), ts |

All ids are `crypto.randomUUID()` so local and cloud rows share identity.

### Supabase (Postgres) — cloud mirror

Same tables (`planners, pages, strokes, blocks, habits, habit_checks, categories,
events`) with two differences: every table gains `owner_id uuid not null default
auth.uid() references auth.users`, and binary image content lives in a Storage
bucket (`blocks.image_path` instead of a blob). RLS on every table:
`owner_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE. No service-role usage
from the client, ever.

### Sync mapping

`syncQueue` records every local mutation (table, rowId, op, ts). A background
module drains the queue → upserts/deletes to Supabase with last-write-wins on
`updatedAt`. Pull direction: per-table `updated_at > lastPulledAt` delta. **Phase 0
ships the queue + a stubbed `sync()` no-op**; real logic later.

## 3. Dependencies (versions verified live against npm on 2026-07-08)

| Package | Version | License | Note |
|---------|---------|---------|------|
| next | 16.2.10 | MIT | App Router, Turbopack default |
| react / react-dom | 19.2.7 | MIT | |
| typescript | ^5.9 | Apache-2.0 | 6.0.3 is latest but 5.9 pinned for Next 16 compatibility |
| tailwindcss | 4.3.2 | MIT | v4 CSS-first config via `@tailwindcss/postcss` |
| dexie | 4.4.4 | Apache-2.0 | |
| dexie-react-hooks | 4.4.0 | Apache-2.0 | `useLiveQuery` |
| @supabase/supabase-js | 2.110.1 | MIT | |
| perfect-freehand | 1.2.3 | MIT | ink stroke outlines (Phase 2) |
| react-virtuoso | 4.18.10 | MIT | virtualized feed (Phase 1) |
| pdf-lib | 1.17.1 | MIT | PDF export w/ internal links (Phase 6) |

No license concerns — all MIT/Apache-2.0. tldraw avoided per architecture ruling.

## 4. Risk list

1. **Pen latency** — pointer events can lag behind the pen. Mitigations: draw the
   in-progress stroke on a dedicated overlay canvas, use `getCoalescedEvents()`,
   `touch-action: none`, avoid React re-render per point (imperative canvas),
   consider `desynchronized: true` canvas hint on Chromium.
2. **Palm rejection** — rely on `pointerType === 'pen'` vs `'touch'`; suppress
   touch-draw while a pen is active or hovering; allow touch scroll only.
3. **Clipboard image paste** — `paste` events expose images reliably on
   Chromium/Edge; `navigator.clipboard.read()` needs permission + secure context.
   Store pasted images as Blobs in Dexie (structured clone), never data-URLs.
4. **Virtualization at 79 pages** — page heights are large (~1600px) and near-
   uniform; react-virtuoso handles variable heights natively. Risk is canvas
   re-init cost on mount/unmount → keep a generous overscan buffer and cheap
   stroke re-render (single path redraw per page).
5. **PDF export fidelity** — vector strokes re-render into PDF as paths (crisp),
   images embed directly; internal hyperlinks require pdf-lib link annotations
   with explicit destinations. Risk: font mismatch — use standard fonts in export.

## 5. Gate status

- **GATE C (resolved from screenshots):** side buttons = `*` Current Week, `T` To Do,
  `B` Business, `H` Habits, `N` Notes, 🎂 Birthdays — matches the plan's guess.
- **GATE A / GATE B:** not needed until Phases 3 / 5. Defaults will be proposed and
  documented in those phase reports if unanswered.
