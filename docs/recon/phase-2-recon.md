# Phase 2 Recon — Ink + Paste

## Ink data flow

```
PointerEvent (pen) ──► InkCanvas (per page, mounted only while visible)
  pointerdown: guard pointerType==='touch' (palm rejection) → capture pointer
  pointermove: getCoalescedEvents() (fallback: the event itself) →
               push [x, y, pressure] in LOGICAL page units (PAGE_W=1000) →
               imperative canvas repaint (React never re-renders mid-stroke)
  pointerup:   stroke row → Dexie strokes.put → syncQueue → history.push
```

- **perfect-freehand** turns point arrays into outline polygons; `Path2D` objects
  are cached per stroke id, so a page redraw is one cached-path fill per stroke.
  The in-progress stroke bypasses the cache (`__live__` id).
- **Pressure**: real pen pressure recorded per point; `simulatePressure` kicks in
  only when every point reports the 0.5 mouse default.
- **Why strokes stay cheap at high counts**: committed strokes redraw only when
  the stroke set changes (Dexie liveQuery); live drawing repaints cached paths +
  one uncached live stroke; unmounted pages (74 of 79) cost nothing.

## Palm rejection

`pointerType === 'touch'` never draws; touch retains `touch-action: pan-y` for
scrolling. While a pen stroke is active the scroller gets `touch-action: none`
(via `setPenActive`) so a resting palm can't scroll mid-stroke.

## Tool palette (from Jo's Drawboard toolbar screenshot)

7 pens (blue/purple/green/red @1pt, orange/pink/black @1.5pt), highlighter 8pt
@ 40% multiply, stroke-level eraser 4.5pt, text box, rectangle 3pt, image
insert, undo/redo, duplicate page. `pt → logical units` via 1000/612.

## Blocks & clipboard

Blocks (text / task / image) are absolutely-positioned divs between the page
template and the ink canvas; interactive only in Select mode (`pointer-events`
toggling), movable + corner-resizable, image bytes stored as Blobs in Dexie.
`Ctrl+V`: image data → image block; internal copied block → clone onto the page
nearest the viewport center; plain text → text block. "→ Next week" on an
unfinished task copies it to the following week page. All mutations flow through
`actions.ts` → Dexie + syncQueue + a single undo/redo history (200 entries).

## Instant page duplication

A page is just rows: clone page + strokes + blocks with fresh UUIDs in ONE Dexie
transaction, shifting later page indexes +1. Measured <500 ms for 300 strokes in
tests (typically ~10 ms) — the direct answer to Drawboard's re-raster delay.
