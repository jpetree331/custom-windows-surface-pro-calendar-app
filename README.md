# Jo's Planner (`jotter`)

A fast, pen-first, continuously-scrolling digital planner for a Windows Surface Pro —
built to replace a 79-page Drawboard PDF that bogs down. Local-first (IndexedDB),
installable PWA, vector ink, virtualized scroll.

## Stack

Next.js (App Router) + TypeScript · Tailwind v4 · Dexie (IndexedDB, source of truth) ·
Supabase (cloud mirror, RLS owner-scoped) · perfect-freehand (ink) · react-virtuoso
(virtualized feed) · pdf-lib (export).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

The app runs fully offline with no configuration. To enable cloud sync, copy
`.env.example` to `.env.local`, create a Supabase project, and apply
`supabase/migrations/0001_init.sql` in its SQL editor.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production build / serve |
| `npm run typecheck` | strict TypeScript check |
| `npm run gen:icons` | regenerate PWA icons |
| `npm run test:rls` | prove cross-owner reads are denied (needs live Supabase + test users) |

## Docs

- [Master build plan](docs/Jo-Planner-Master-Build-Plan.md)
- [Phase recon docs](docs/recon/) · [Phase reports](docs/reports/)
- Reference screenshots in [docs/reference/](docs/reference/)
