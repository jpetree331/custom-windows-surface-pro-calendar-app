# Feedback round 9 — Stage 1 (Jo's big list)

Shipped: selection/ink upgrades, toolbar reorganization, Google items, page
polish. Stage 2 (editable side buttons + Notepad windows) ships separately.

## What changed

**Selection & ink**
- Selection-box handles now SCALE the selected contents (strokes + blocks,
  width/font scaled by the geometric mean) instead of re-capturing membership.
  Corner handles lock aspect ratio (both the ⬚ box and single-item resize);
  edge handles stretch. One undo step (`scaleSelectionContents`).
- Recolor row on the selection bar (`recolorSelectionContents`) — the same
  category swatches + custom picker as the text menu (shared
  `useColorSwatches`), one undo step, no path-cache invalidation needed.
- Lasso tool (➰): freeform outline → standard `AreaSelection` carrying the
  polygon's bbox, so move/copy/scale/recolor need zero extra code
  (`computeAreaSelectionPolygon`, shared membership heuristic).
- Circle tool: 2-point stroke like rect; both shapes follow the active pen's
  color AND width (`RECT_WIDTH_PT` removed). Canvas + eraser + PDF branches.
- Drag-snap-back bug fixed: the block move surface was missing
  `touch-action:none` (Windows pen-pan arbitration) and a <1-unit dead zone
  swallowed small nudges.

**Google**
- Week cells: chips at the TOP (full width); holiday+moon → bottom-left;
  birthday leads → bottom-right (`BirthdayReminders`).
- Chips drag within their day (select tool), stored as % offsets
  (`offsetX/offsetY`), clamped to the cell, ↺ un-pins. Not in Ctrl+Z.
  Offsets survive re-imports (upsert preserves them).
- Details popover on hover (mouse) or double-tap (pen): title, time,
  description, location, reminder settings (description/location now
  imported).
- Derived `kind:"notice"` rows, wiped+rebuilt every import: 🔔 chips on the
  day a ≥24h Google reminder fires, 🎂 1wk/2wk leads per Google birthday.
- Calendar checklist in the Google panel (`planner.settings.googleCalendarIds`)
  + self-healing purge of imported "Phases of the Moon" text events.
- Upsert lookup is now planner-scoped (googleId collisions across the
  Dec 28–Jan 4 window overlap were stealing rows between years).

**Toolbar & pages**
- Removed: insert-image, paste, add-page, View menu, both export buttons.
  Right-click menu gained "Insert image…" (+ relabeled Paste); View radios
  moved into Settings; one ⬇ PDF popover (current page / range / year —
  `scope:"range"` in export.ts).
- 8th pen slot (legacy 7-entry localStorage merges cleanly), hex input, and
  "Previous color" (snapshot-on-open) replacing factory Reset.
- `LabelPill` auto-fits long custom titles (measure + font shrink).
- "Rename page…" for custom pages (uppercased, not undoable, like other
  renames).
- Birthday list rows: text sits on the ruled line, 1.35 → 1.6cqw.

## Review round (3 agents)

Fixed: planner-scoped upsert (critical), drag's trailing click expanding the
chip, resize-commit async race (ref now nulled synchronously), dead
`onSelectionClipboardChange` pub/sub removed, triplicated block hit-test →
`topBlockAt`, marquee/lasso paint + membership heuristics deduped, and a
setState-in-render in `updateSlot` (pre-existing, surfaced by review).

Accepted limitations (documented): birthdays in the first ~2 weeks of January
lose their lead chips (they'd land in the previous year's planner); chip drag
offsets don't affect the PDF; emoji glyphs print as ASCII stand-ins.

## Verification

91/91 tests (22 new: aspect lock, polygon membership, scale/recolor undo,
notices, moon purge, checklist, offset preservation, chip clamp). Live checks
in the preview: toolbar inventory, pen editor (hex two-way + previous color),
PDF popover, settings View section, context menu, marquee + lasso capture,
numerically exact ratio-locked scaling (27→67px, ratio to 4 decimals), chips
end-to-end (top placement, double-tap popover with location/description/
reminder, drag-to-pin persisted). Typecheck + production build clean.
