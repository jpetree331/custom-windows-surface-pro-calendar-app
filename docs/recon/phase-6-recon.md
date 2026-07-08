# Phase 6 Recon — PDF Export

## Pipeline choice: data-driven pdf-lib rendering (client-side)

Evaluated options:

| Option | Fidelity | Hyperlinks | Verdict |
|---|---|---|---|
| DOM screenshot → PDF (html2canvas etc.) | raster (blurry print, huge files) | no internal links | rejected |
| Server-side headless render → PDF | good, but needs a server + still raster ink | partial | rejected (local-first app; no server exists) |
| **Re-render from data with pdf-lib** | **vector ink stays vector** (perfect-freehand outlines → PDF paths), text stays text | **full control: GoTo link annotations** | **chosen** |

The planner's source of truth is structured data (strokes as point arrays,
blocks, computed overlays), so the PDF is drawn from the same data the screen
uses — not from pixels. Highlighter uses a real `/Multiply` blend ExtGState;
images embed at native resolution; moon glyphs draw as vector circles/half-discs
(standard fonts have no emoji).

## Hyperlinks

Every page gets 19 link annotations — 12 month tabs, the '26 corner, and the 6
side buttons — as `/Link` annotations with explicit `Dest [pageRef /XYZ]`
destinations resolved in a first pass (all PDFPages created before drawing so
any page can target any other).

## Page size

**US Letter (612×792 pt)** — aspect 0.773 vs the logical page's 0.769, a
near-exact fit (scale 0.609 pt/unit, 1.4 pt side margins). Prints cleanly on
Letter stock and reads comfortably on the Surface Pro's 3:2 screen.

## Export scopes

Toolbar: **⬇ Page PDF** (the page centered in the viewport) and **⬇ Year PDF**
(all 79+ pages, links active). Generator is DOM-free (`src/lib/pdf/export.ts`),
so the full pipeline runs and is verified under vitest + fake-indexeddb.
