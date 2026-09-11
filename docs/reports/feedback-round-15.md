# Feedback round 15 (Jo) — custom page backgrounds

*Date: 2026-09-11 · Jo: "could we add the ability to change the background…
add our own images? Maybe specify what resolution you need."*

## What she gets

⚙ Settings has a new **Background** section: **Choose picture…**, a small
preview, a **Picture strength** slider (10–100%, default 60%), and
**Remove**. The picture sits behind the template on every page of the
current year — week, month, year, sections, birthdays — and prints both
with Ctrl+P and in the ⬇ PDF (page, range or year). Notes keep their white
paper.

**Resolution answer for Jo:** any picture works. The page is portrait,
10:13 (the app's logical page is 1000 × 1300), and the picture is cropped
to cover it like a phone wallpaper — so a portrait shot fills the page and
a landscape one loses its sides. Pictures are shrunk on the way in to at
most 2000 × 2600 and stored as JPEG, so a phone photo is fine; there's no
minimum, but 1000 × 1300 or larger keeps it crisp on the Surface.

## How it's built (for Jess)

- New Dexie table `assets` (**version 5, additive**, per data-safety.md):
  `{ id, plannerId, kind: "background", blob, updatedAt }`. One row per
  planner year; setting again replaces in place. Strength lives in
  `planner.settings.backgroundStrength`.
- Backups carry it (base64, like image blocks); restore merges it by
  recency like the other stamped tables. The Drive auto-backup sees the
  change like any other write.
- Starting the next year copies the picture and its strength along with
  categories, habits, pages and buttons.
- One object URL is made in PlannerShell and shared through the planner
  context, so 79 pages don't each mint their own; PageFrame renders an
  `<img>` (not a CSS background) so Ctrl+P prints it.
- PDF: embedded once per document, drawn on every page under the template
  with the same strength (object-fit: cover math).
- Downscale uses `createImageBitmap` + `OffscreenCanvas` → JPEG q0.86; where
  the browser can't (Node/tests, odd formats) the original bytes are kept.

## Verification

129 tests (3 new: replace-in-place/clear/strength clamp, backup round-trip
keeps the bytes and type, carry-over into 2027). Typecheck clean. Live in
the dev preview: a 723 KB 3000×2000 PNG chosen through the real file input
was stored as a 42 KB 2000×1333 JPEG; the page showed it with
`object-fit: cover` at opacity 0.6; the slider moved it to 0.3 live and the
label read "Picture strength: 30%"; a page PDF exported with no error at
48 KB (a bare page is ~10 KB) containing a DCT image XObject; Remove cleared
it from the page and the preview.
