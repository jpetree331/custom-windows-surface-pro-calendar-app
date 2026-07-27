# Feedback round 9 — Stage 2 (side-button editor + Notepad)

## What changed

**Editable side buttons** (Dexie v4 `sideButtons`, per planner, seeded once
from the classic six)
- Settings gains a "Side buttons" editor: glyph (1–2 chars), label, color,
  jump target (current week / any section / any custom titled page via
  `page:<id>`), ▲▼ reorder (order-value swap, gap-safe), ✕ remove, ＋ add.
- `SideButtons.tsx` renders live rows; bevel gradient derived from one stored
  hex (`gradientFrom`).
- Add-Page dialog: "Add a side button that jumps to this page" checkbox.
- PDF export unified: chrome now draws the SAME per-planner rows (fallback to
  defaults for unseeded planners); `page:` link targets resolve; emoji glyphs
  degrade to classic stand-ins (✱→*, 🎂→BD) or the label's first letters.
- The old hardcoded `SIDE_BUTTONS` constant is gone.

**Notepad** (Dexie v4 `notes`, app-global across years)
- 🗒 launcher under the jump buttons opens a floating Notes List (＋ New Note
  first, then notes by recency, open/delete per row with inline confirm).
- Each note is a floating window: drag by title bar, 8-handle resize
  (delta-clamped — windows can't invert or balloon past the minimum),
  click-to-front, close per window; rects stored as viewport FRACTIONS so
  browser resizes never strand a window. Open notes reopen after relaunch.
- Note body hosts a real mini page (`BlocksLayer` + `InkCanvas` keyed by
  `pageId = note.id`) — every pen/text/select tool works inside; the
  1000:1300 space letterboxes, preserving the cqw contract.
- Blank titles auto-derive from the first typed line (window placeholder +
  list row), typed titles override; commit on blur.
- Undo isolation: notes share a `__notes__` history scope, switched by
  pointer-capture on windows vs the feed — verified live that note ink is
  undoable only while a note has focus.
- Notes List window rect lives in device-local `kv` (chrome, not backed up);
  notes + side buttons are in backups; deleting a note cascades to its
  ink/text.

## Review round (3 agents)

Fixed: keystroke-race on the new text inputs (glyph/label/title →
defaultValue+onBlur, matching habits/categories), resize-handle tap bumping
updatedAt and reordering the list, min-size resize ballooning + window
inversion (delta clamp), dead `firstTextByNote`, duplicated pointer-capture
block, missing `data-note-action="open"`.

## Verification

97/97 tests (6 new: seeding idempotence, per-planner independence, gap-safe
reorder, append order, note delete cascade, title derivation; backup
round-trip extended). Live: seeded buttons + jumps + editor (9 target
options), Notepad end-to-end (create, type via text tool, derived title in
window + list, drag, reload persistence, undo-scope isolation, delete
cascade), resize clamp (right edge pinned at min, no inversion, tap = no-op).
Typecheck + production build clean.
