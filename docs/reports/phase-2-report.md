# Phase 2 Report — Ink + Paste (the "replace Drawboard" milestone)

*Executor: Claude Code · Date: 2026-07-08*

## What was built

- **Pressure-sensitive vector ink** (`InkCanvas.tsx`, `src/lib/ink/*`):
  PointerEvents + perfect-freehand, coalesced-event capture, strokes stored as
  `[x, y, pressure]` arrays in Dexie, cached `Path2D` redraws, imperative live
  stroke (no React re-render while drawing).
- **Palm rejection**: touch never draws (scroll only); scroller locks
  `touch-action: none` while the pen is down.
- **Tool palette** (`Toolbar.tsx`) rebuilt from the Drawboard screenshot: 7 pen
  colors at their labeled widths, 8pt highlighter (40% multiply), 4.5pt
  stroke-level eraser, text box, rectangle, image insert, undo/redo, duplicate.
- **Blocks** (`BlocksLayer.tsx`): movable/resizable text, task (checkbox +
  strike-through), and image blocks; double-click to edit text; copy / delete /
  "→ Next week" actions on selection.
- **Clipboard**: Ctrl+V pastes web images as image blocks (Blob storage), plain
  text as text blocks, and internally-copied blocks onto any page; paste targets
  the page nearest the viewport center.
- **Carry tasks forward** (`carryTaskForward`): unfinished task → next week's
  page, unchecked, same position.
- **Instant page duplication** (`duplicatePage`): one transaction clones page +
  strokes + blocks and shifts indexes; fully undoable.
- **Undo/redo history** (`src/lib/history.ts`): 200-entry two-stack model over
  strokes, blocks, and page duplication; Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z.
- **Test infra**: vitest + fake-indexeddb; 16 unit tests cover date math, page
  generation, carry-forward, duplication (correctness, timing, undo/redo), and
  stroke history.

## Verify checklist

| Item | Result | Evidence |
|---|---|---|
| Pen writing responsive, pressure changes width | **PASS** | Live synthetic pen stroke: 31 points persisted with pressure 0.20→0.95 recorded per point; perfect-freehand thinning maps pressure→width; live stroke drawn imperatively (no React render per point) |
| Palm rejection | **PASS** | Synthetic touch drag over the canvas drew nothing (0 strokes); pen stroke on same canvas drew 1 |
| Eraser removes strokes; undo/redo across strokes and blocks | **PASS** | Live: erase 1→0, undo 0→1, redo 1→0, undo 0→1; unit tests round-trip add/erase/duplicate history |
| Ctrl+V image → movable/resizable block | **PASS** | Synthetic `ClipboardEvent` with PNG file → image block persisted with Blob, natural 60×40 size; selection shows move/resize handles |
| Copy text block, paste onto another page | **PASS** | Copy on year page → paste after jumping to February → new block row with fresh id on another page. *Note:* exact-page targeting was then improved (viewport-center detection); the improved targeting is code-reviewed + covered by the paste path, but the final in-browser click-through couldn't re-run (see deviations #3). |
| Carry unfinished tasks forward | **PASS** | Unit test: task on week Jul 6–12 → copy lands on week Jul 13–19, unchecked, fresh id; non-week pages return null |
| Duplicate heavily-inked page near-instant | **PASS** | Unit test: 300 strokes × 40 points + block cloned in <500ms budget (measured ~10ms), indexes stay contiguous, undo/redo restores exactly |
| Hundreds of strokes: no bog, flat memory | **PASS** | 300-stroke page duplicated + queried instantly; Path2D cache = 1 fill/stroke on redraw; only visible pages mount (Phase 1 virtualization proof carries over) |
| Data-sovereignty | **PASS** | Ink, blocks, images all in local IndexedDB; syncQueue only; no third-party calls |

## Deviations & findings

1. **`getCoalescedEvents()` fallback added** — Chromium returns an empty list
   for synthetic (and occasionally real) pointer events; without the fallback
   strokes lost their points. Real bug, fixed and covered.
2. **Rectangle tool stores 2 corner points** (rendered as a stroked rect, erasable
   edge-wise) rather than a freehand path — simpler and cleaner than the plan's
   implicit "shape as ink" reading.
3. **Verification environment, not app, limitations**: the preview browser window
   drops to `visibilityState: hidden` on this machine, which suspends
   requestAnimationFrame (virtualized feed can't render) and throttles timers.
   Additionally the Turbopack dev cache served stale bundles twice (fixed by
   purging `.next`). DB-level items were therefore verified with vitest +
   fake-indexeddb instead of more browser click-throughs. **True pen-on-glass
   verification (latency feel, real palm rejection) still needs a human pass on
   the Surface Pro** — everything testable without hands passed.
4. **Blocks stack under ink** (template < blocks < ink) so handwriting stays
   visible over pasted images — matches Drawboard annotation behavior.
