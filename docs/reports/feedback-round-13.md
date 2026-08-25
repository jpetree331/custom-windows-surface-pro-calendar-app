# Feedback round 13 (Jo) — 15 items

## The text box, made grabbable

Four of Jo's items are one story: a text box she'd already placed was hard to
get hold of again.

- **Handles resize now, instead of dropping a new box.** An unselected block
  is pointer-transparent unless the *select* tool is active, and `startDrag`
  bailed out *before* calling `stopPropagation()` — so with the text tool the
  press fell through to the page layer, which does one thing on a press:
  place a new text box. Blocks now accept the text tool too, and the press is
  always swallowed by the block it landed on.
- **Tap to select, double-click to edit** — both with the text tool, so she
  never has to change tools mid-thought.
- **A ✥ grip** sits above the selected box. Drag it with *any* tool — pen,
  highlighter, text, select — and the box moves without a stroke being drawn.
- **Left / center / right justify** (◧ ▥ ◨) on the same toolbar, stored on the
  block and honored by the PDF export as well as the screen.

## The imported items, moved to the corner

Google chips now flow from the day's **top-right corner**, right-aligned,
capped at half the cell's width, wrapping onto the line below when there are
more. When the day carries a moon glyph the chips reserve its corner and line
up beside it. Dragged chips keep their stored positions — only the un-dragged
flow moved.

**And they wear her colors.** Imported rows are tagged with the matching
category on import: holidays pink, birthdays *and anniversaries* orange,
appointments turquoise, Google Tasks purple. A category she picked by hand is
never overwritten — the mapping only fills in rows that have none.

**Month pages leave Google Tasks out**, the way they already leave reminders
out: the month grid is for what's happening that day.

## The sidebar buttons

- **Birthdays can move anywhere now.** The bug wasn't a rule about position —
  new buttons took `order = <row count>`, which after any delete *collides*
  with an existing value, and reordering swaps two equal numbers: nothing
  happens. Orders are renumbered 0..n-1 on add, delete and move.
- **A ▾ symbol picker** — 30 common symbols (★ ✓ ✚ ✎ ⚑ ☀ ☾ ♥ ● ▲ ■ ◆ ⚙ 🎂 🗒
  📌 📞 💊 🛒 💰 🎁 🐾 ✈ …) — so a button can be a picture, not a letter.
- **Three characters** instead of two, on screen and in the PDF, shrinking to
  fit the button.

## Selecting more than one thing

- **Ctrl-click** a second box (or a third) and they gather into the standard
  dashed ⬚ selection — so move, copy, cut, delete and resize all work on the
  group with machinery that already existed.
- **Circles and rectangles are selectable**: tap one with the hand tool *or*
  with the shape tool that drew it and it gets the eight resize handles. A tap
  with the shape tool used to stamp a zero-size shape; now it picks up the one
  under her pen.

## Pasting from outside the app

Round 11 handled Ctrl+V on `keydown` so a cut ⬚ selection could be pasted —
and called `preventDefault()`, which **cancels the browser's own paste event**.
That is why nothing copied from outside the calendar could ever come in: once
anything had been copied *inside* the app, the OS clipboard was locked out.

Now the native paste event always gets first refusal, and the app's own
clipboard runs on a short fallback timer when no event arrives (an empty OS
clipboard fires nothing at all). Which clipboard wins is decided by **whichever
was filled last**: the app stamps its own copies, and the last time the window
lost focus stands in for the OS clipboard's timestamp, since it can only have
been refilled while she was in another program. Copy a recipe in her browser,
come back, Ctrl+V → it lands as a text box. Cut a ⬚ selection here and paste
without leaving → the selection lands, even though the OS clipboard is still
holding text from an earlier in-app copy.

## Rolling over into the new year

Starting 2027 now carries her setup forward, not just the blank pages:

- Custom pages she added at the back of the year reappear at the back of the
  new one, with their titles. **Structure, not content** — a year of
  handwriting isn't duplicated.
- Every sidebar button carries over in order, keeping its glyph, label and
  color. Buttons that pointed at one of those pages are repointed at the new
  year's copy; a button pointing at something that didn't roll over falls back
  to the current week rather than jumping into last year.
- Categories and active habits carry over as before.

## Review findings fixed before shipping

- **A stale OS clipboard could beat a fresh in-app cut.** Ordering the paste
  "OS first" fixed the original complaint but broke the ⬚ cut/paste flow: text
  from a block copied minutes earlier sits in the OS clipboard forever, and
  would have pasted instead of her selection. Resolved with the
  last-copy-wins rule described above.
- **The rollover never marked the database dirty**, so the silent Drive backup
  saw a "clean" database and could skip a whole new year of setup. All seeded
  rows (planner, pages, categories, habits, buttons) now reach the sync queue —
  including the first-ever planner, which had the same gap.
- **A crisp stylus tap reports a single point and no move**, which the ink
  canvas discarded outright — so the new "tap a shape to select it" gesture
  would have missed on a clean tap. Taps are now evaluated before the
  is-this-a-stroke test.
- Simplifications: one shared paste-target helper instead of four copies of
  the same expression, one moon/holiday lookup per day instead of two, and a
  redundant focus call removed.

## Verification
115 tests (new: side-button reorder after a delete, year rollover — pages,
buttons, target repointing, sync-queue dirtiness — shape hit-testing,
imported-chip category mapping including "never overwrite her choice", and
clipboard recency). Typecheck + production build clean.

Live in the browser, against a real IndexedDB:
- text tool: tap selects an existing box (no new box), east handle drag
  widened it 28→53 px, double-click reopened it for editing with its text
  intact, ◧▥◨ set `text-align` and persisted `align: "right"` to the database
- ✥ grip dragged the box from (300,455) to (467,580) **with the pen tool
  active**, drawing no stroke
- ctrl-click on a second box produced one selection box spanning both
- rect tool: single-point tap selected the existing rectangle (8 handles) and
  stamped nothing; hand tool did the same
- side buttons: Birthdays moved 6th → 5th → 4th → 3rd and back down (the old
  wall was the 5th spot), symbol picker showed 30 symbols and applied 🎂, a
  3-character name "TDO" saved and rendered shrunk to 11.5 px
- chips: right-aligned flush to the cell (1.4 px inset), a long title capped
  at 51% of the cell and wrapped to the next line, colors read
  #3DC9FD / #FF9B24 / #FF5CB9 / #7400B3 from her categories, and on a moon day
  the chip stopped clear of the glyph (no overlap)
- month page showed the holiday chip but not the Google Task
- paste: external text after leaving the app created a text box; a copied ⬚
  selection pasted (strokes 1→2) with stale OS text present and no stray box
- rollover: "＋ Start 2027" carried all seven buttons with their edited glyphs,
  created the RECIPES page at the back of 2027 (79 pages), repointed the
  Recipes button at the 2027 copy, and clicking it landed on that page

Not verifiable here: real Google account import (the category mapping is
covered by tests against recorded API shapes) and screenshots — the preview
pane is not displayed in this environment, so verification was done through
the live DOM and IndexedDB rather than images.
