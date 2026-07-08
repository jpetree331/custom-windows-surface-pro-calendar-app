# Jo's Planner — Master Build / Verify Plan

*A phased Claude Code build plan in the Recon → Build → Verify format. Architect = web Claude. Executor = Claude Code. Codename below is a placeholder — rename freely (`Jotter` is a nice Jo-pun if you want one).*

**Codename:** `jotter`

---

## The one-paragraph brief

A fast, pen-first, continuously-scrolling digital planner for a Windows Surface Pro, meant to replace a 79-page Drawboard PDF that bogs down. It looks like Jo's existing planner (year page, 12 month pages, 52 weekly spreads with a Tasks / Cleaning / Habits right column, plus notes/section pages), scrolls up and down as one long virtualized feed, and lets her write and draw with the Surface pen, paste images and text blocks (including carrying unfinished tasks forward), track habits, color-code customizable categories, auto-fill dates with holidays and moon phases, sync events/reminders/birthdays with Google Calendar, and export to a hyperlinked PDF.

---

## Why this beats Drawboard on speed (the whole point)

Drawboard is slow because every page is a rasterized PDF with annotation layers stacked on top; duplicating or opening a page re-renders all of that. This app avoids it three ways:

1. **Virtualized scroll** — only the pages currently on screen (plus a small buffer) are ever mounted in the DOM. The other ~75 pages cost nothing. Scrolling 79 pages stays smooth because you're never rendering 79 pages.
2. **Vector ink** — strokes are stored as point arrays, not pixels. Cheap to draw, cheap to save, cheap to duplicate. A "page" is a data object, so duplicating it is a clone, not a re-raster.
3. **Local-first** — IndexedDB on the device is the source of truth. The UI never waits on the network. Supabase sync happens in the background.

---

## Locked architecture (architect's rulings)

| Concern | Decision | Rationale |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript on Vercel | Your stack; you have Vercel Pro |
| Local store | IndexedDB via **Dexie** = on-device source of truth | Instant + offline on the Surface |
| Cloud store | **Supabase** (Postgres + Auth + RLS), background sync | Your stack; matches ClassDots/EdgeUCoin patterns |
| Ink | Custom canvas: **PointerEvents + `perfect-freehand`**, strokes as vectors | Full Surface-pen pressure/tilt; fits a paged planner (tldraw is infinite-canvas + license to re-verify) |
| Scroll | Virtualized vertical feed (`react-virtuoso` or custom IntersectionObserver) | Direct fix for the "bog down" |
| Shell | Installable **PWA** | App-feel + offline on the Surface Pro |
| Events/reminders | **Google Calendar** as the engine | Native RRULE, reminders, birthday import, attendee invites |

---

## ⚠️ Open decision gates — confirm before the noted phase

Everything before Phase 3 can be built without these. Resolve each before its phase:

- **GATE A (before Phase 3): Holidays + moon + range.** US federal + common holidays only, or add religious/custom dates? Moon phases: 4 primary or all 8? Year range: 2026 only, or perpetual/multi-year generator?
- **GATE B (before Phase 5): Google scope + hosting.** Import-only, or full two-way sync? Who hosts — you host for Jo (keep the Google OAuth app in *testing* mode with Jo allow-listed = simplest), or Jo runs her own? Confirm "share to Google Contacts" = invite a contact as an event attendee.
- **GATE C (confirm at Phase 1): Side-button legend.** My read of `buttons.png` is `*` = Current Week, `T` = To Do, `B` = Business, `H` = Habits, `N` = Notes, 🎂 = Birthdays. Correct any before templates are cut.

---

## Global conventions for every phase

Paste this block at the top of each phase prompt so Claude Code inherits the rules:

> **Workflow:** Recon → Build → Verify. Do Recon fully before writing code. Do not close a phase until every Verify item passes.
> **Autonomy clause:** You may make and act on reasonable implementation decisions without stopping to ask, *except* for: changing the locked stack, adding a paid/third-party service, touching auth/RLS security boundaries, or anything under an open decision gate. For those, stop and surface the choice.
> **Data-sovereignty check (mandatory, every phase that touches storage):** Confirm all user content lives in Jo's local IndexedDB and her own Supabase project, that RLS restricts every row to its owner, and that no data is sent to any third party except Google (and only under Gate B's approved scope). Print a one-line PASS/FAIL for this at the end of the phase.
> **Verify gate:** End each phase with a checklist of the Verify items and a PASS/FAIL per item. If any FAIL, fix before closing.

---

# PHASE 0 — Recon & Scaffold

**Recon prompt**
```
You are the executor for a project codenamed `jotter`: a pen-first, continuously
scrolling digital planner for a Windows Surface Pro that replaces a slow 79-page
Drawboard PDF. Read the Master Build Plan I'm pasting alongside this.

RECON ONLY — do not scaffold yet. Produce:
1. A page inventory for the planner: 1 year page, 12 month pages, 52 weekly
   spreads, plus notes/section pages, targeting ~79 pages total for one year.
   List each page type with the data it needs (dates, labels, grid regions).
2. A proposed data model (tables/stores) covering: planner, page, stroke, block
   (text/image/task), habit, habit_check, category, event. Show it for BOTH
   IndexedDB (Dexie) and Supabase (Postgres + RLS), and the sync mapping between.
3. A dependency list with the CURRENT version of each library you'd use
   (verify versions live — do not rely on memory), flagging any license concerns.
4. A risk list: pen latency, palm rejection, clipboard image paste, virtualization
   at 79 pages, and PDF export fidelity.
Output as a short design doc. Ask me nothing you can reasonably decide.
```

**Build prompt**
```
Scaffold `jotter`: Next.js (App Router) + TypeScript, Tailwind, Dexie, Supabase
client, and a PWA manifest + service worker. Set up the Supabase schema with RLS
so every row is owner-scoped. Wire the local-first pattern: Dexie is the source of
truth, with a stubbed background sync module (no real sync logic yet). Add an env
template. Commit as an atomic, running skeleton — `npm run dev` must boot to a
placeholder page.
```

**Verify prompt**
```
Verify Phase 0: app boots; PWA installable prompt appears in Edge; Dexie DB
initializes; Supabase connects with RLS on and denies cross-owner reads (write a
tiny test proving a second user cannot read the first user's rows); data-sovereignty
PASS/FAIL. Report the checklist.
```

---

# PHASE 1 — Planner Spine (the fast scroll)

*Goal: the whole planner exists, auto-dated, and scrolls beautifully. Still static (no ink yet). This is where the speed win becomes visible.*

**Recon prompt**
```
RECON for the planner spine. Plan:
- A virtualized vertical scroll feed rendering all ~79 pages as one continuous
  document (like a PDF reader's continuous mode). Only visible pages + a small
  buffer mount. Choose react-virtuoso or a custom IntersectionObserver approach
  and justify it for variable-height pages.
- Page templates matching the screenshots I provided:
  * WEEK: 7 day-rows (Mon–Sun) down the left with date numbers, large daily note
    area, right column = TASKS (top) → CLEANING (mid) → HABITS grid (Mon–Sun
    checkbox columns) at bottom.
  * MONTH: standard month grid.
  * YEAR: 12-month overview.
  * NOTES/SECTION pages.
- Top nav bar: JAN…DEC month tabs + a "'26" corner, each a scroll-jump anchor to
  that month's page; selected month highlighted based on scroll position.
- Side buttons (confirm legend — my guess: * = Current Week, T = To Do,
  B = Business, H = Habits, N = Notes, 🎂 = Birthdays), each a scroll-jump anchor.
- Auto-fill: generate all dates for the year; "Current Week" jumps to the week
  containing today.
Output the component tree and the anchor/jump mechanism.
```

**Build prompt**
```
Build the planner spine per the approved recon. Generate the full year's pages
into Dexie on first run. Implement the virtualized feed, all page templates styled
to match the screenshots (gradient background, blue date numbers, boxed regions),
the top month-tab bar with active-month highlight tied to scroll position, and the
side buttons. All tabs/buttons scroll-jump smoothly to their target page.
Keep it static — no drawing yet.
```

**Verify prompt**
```
Verify Phase 1:
- Scroll top-to-bottom through all ~79 pages; confirm it stays smooth (target ~60fps)
  and memory stays flat (prove only visible pages are mounted — check the DOM node
  count doesn't grow with scroll).
- Every month tab jumps to the correct month page.
- Every side button jumps to its section.
- "Current Week" lands on the week containing today's date.
- Dates are correct for the whole year (spot-check Jan 1, a mid-year week, Dec 31).
- Templates visually match the reference screenshots.
Report PASS/FAIL per item + data-sovereignty line.
```

---

# PHASE 2 — Ink + Paste (the "replace Drawboard" milestone)

*Goal: Jo can actually write, draw, and paste. After this she could switch off Drawboard.*

**Recon prompt**
```
RECON for the ink + paste layer on a Windows Surface Pro (Edge/Chrome, real
PointerEvents with pressure + tilt).
- Per-page ink surface (canvas or SVG overlay) using PointerEvents + perfect-freehand.
  Strokes stored as vector point arrays in Dexie (tool, color, width, pressure).
- Palm rejection: distinguish pen from touch/mouse via pointerType; ignore touch
  while pen is active.
- Tool palette rebuilt from Jo's Drawboard toolbar: pen colors
  (blue/purple/green/red/orange/pink/black), widths ~1–1.5, highlighter, eraser
  (~4.5), plus text box, rectangle, and image tools. Undo/redo.
- Clipboard: Ctrl+V pastes an image copied from the web anywhere on a page as a
  movable/resizable image block. Also support pasting/copying TEXT blocks, and a
  "carry unfinished tasks forward" action that copies selected task text to next
  week's page.
- Duplicate-a-page action that clones the page's data (must be instant — this is
  the specific Drawboard pain point).
Output the ink data flow and how strokes stay cheap at high stroke counts.
```

**Build prompt**
```
Build the ink + paste layer per recon. Deliver: pressure-sensitive pen drawing
with palm rejection, the full tool palette, highlighter + eraser, undo/redo,
Ctrl+V image paste as movable/resizable blocks, text blocks, copy/paste of blocks
between pages, the "carry unfinished tasks forward" action, and instant page
duplication. Persist everything to Dexie; queue it for background sync.
```

**Verify prompt**
```
Verify Phase 2 on a Surface Pro:
- Pen writing feels responsive (low latency); pressure changes stroke width.
- Palm rejection: resting a hand while writing does not draw.
- Eraser removes strokes; undo/redo works across strokes and blocks.
- Copy an image from a website, Ctrl+V onto a page — it lands and is movable/resizable.
- Copy a text block and paste it onto another page.
- "Carry unfinished tasks forward" moves a task to next week.
- Duplicate a heavily-inked page — confirm it's near-instant (the Drawboard failure case).
- Load a page with hundreds of strokes — confirm no bog and flat memory.
Report PASS/FAIL per item + data-sovereignty line.
```

---

# PHASE 3 — Dates, Holidays, Moon Phases  ⚠️ resolve GATE A first

**Recon prompt**
```
RECON for computed calendar overlays. GATE A decisions: [PASTE Jo's answers on
holiday scope, moon 4-vs-8, and year range here].
- Holidays: compute (not hardcode) the approved holiday set for the year and mark
  them on the correct day cells with labels.
- Moon phases: compute phase per date from an ephemeris library or algorithm; mark
  the approved set (4 or 8) on day cells with a small glyph.
- Range: [2026 only | perpetual generator per the gate].
Identify the holiday source and the moon-phase method, and how you'll validate them.
```

**Build prompt**
```
Build the holiday + moon-phase overlays per recon and Gate A. Render them onto the
week/month/year templates without disrupting the ink layer (overlays sit beneath ink).
```

**Verify prompt**
```
Verify Phase 3: cross-check holidays against a known-good published list for the year;
cross-check 6 moon-phase dates against a published lunar calendar; confirm overlays
render on the right cells and never block pen input. PASS/FAIL per item.
```

---

# PHASE 4 — Habits + Customizable Color Categories

**Recon prompt**
```
RECON for habits + categories.
- Habit tracker matching the HABITS grid in the weekly template: rows = habit names,
  columns = Mon–Sun checkboxes, tappable/pennable to toggle. Support daily and weekly
  habits. Persist checks per date.
- Customizable categories: user can add/rename/delete categories and assign each a
  color. Categories color-code events and blocks. Provide a starter set but make all
  of it editable.
Output the schema deltas and the settings UI.
```

**Build prompt**
```
Build habits + categories per recon. Habit grid with persistent daily/weekly checks;
a category manager (add/rename/delete/recolor); apply category colors to events and
blocks. Everything owner-scoped in Dexie + Supabase.
```

**Verify prompt**
```
Verify Phase 4: toggle habit checks — persist across reload; add/rename/delete a
category and recolor it — changes propagate to anything tagged with it; confirm
weekly vs daily habits behave correctly. PASS/FAIL + data-sovereignty line.
```

---

# PHASE 5 — Google Layer  ⚠️ resolve GATE B first

**Recon prompt**
```
RECON for Google Calendar integration. GATE B decisions: [PASTE Jo's answers:
import-only vs two-way, hosting/OAuth mode, and confirmation that "share to
contacts" = invite contact as event attendee].
- OAuth with the minimal scopes for the approved behavior.
- Events with repeats (RRULE) and reminders surfaced/created via Google.
- Birthday import from Google Calendar onto the correct day cells.
- Attendee invite flow for sharing an event to a contact.
- Verify current Google Calendar API endpoints and scope names live — do not rely
  on memory. Map Google events <-> local events, avoiding duplicate-on-sync.
Output the auth flow, scopes, sync direction, and conflict strategy.
```

**Build prompt**
```
Build the Google layer per recon and Gate B. Implement OAuth, event
import/[sync per gate], RRULE repeats, reminders, birthday import, and attendee
invites. Keep Google the only third party; nothing else leaves the device/Supabase.
```

**Verify prompt**
```
Verify Phase 5: authenticate; import events appear on correct dates; a repeating
event shows on all instances; a reminder is created/fires; birthdays land on correct
days; inviting a contact adds them as an attendee. Confirm no duplicate events after
repeated syncs. PASS/FAIL + data-sovereignty line (Google scope within Gate B only).
```

---

# PHASE 6 — PDF Export

**Recon prompt**
```
RECON for PDF export. Requirements: export any single view or the full year to a
printable PDF that preserves ink, blocks, overlays, and — importantly — keeps the
month tabs and side buttons as working internal hyperlinks in the PDF. Evaluate a
render pipeline (e.g. server-side page render -> PDF, or html/canvas -> PDF) and
justify the choice for fidelity + hyperlink support. Determine correct page size
for both Surface Pro viewing and physical print.
```

**Build prompt**
```
Build PDF export per recon: full-year and single-view export, ink + content
rendered faithfully, internal hyperlinks preserved on tabs and side buttons,
correct page dimensions. Add an Export button to the shell.
```

**Verify prompt**
```
Verify Phase 6: export the full year; open the PDF and confirm month tabs and side
buttons are clickable internal links that jump correctly; confirm ink, images, text
blocks, holidays, and moon phases all render; confirm page size prints cleanly.
PASS/FAIL per item.
```

---

## Suggested delivery order for Jo

Ship after **Phase 2** — that's the moment it replaces Drawboard and the speed problem is solved. Phases 3–6 are enhancements she can get in follow-up drops, which also keeps each Claude Code session scoped and verifiable.

## Before you start, hand Claude Code:
- This document.
- The four screenshots (the weekly spread, the buttons, the toolbar, the scroll/Pages view).
- Your answers to Gates A, B, and C (C at Phase 1; A before Phase 3; B before Phase 5).
