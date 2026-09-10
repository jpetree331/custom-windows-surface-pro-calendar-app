# Feedback round 14 (Jo) — 5 nit-picks

*Date: 2026-09-02 · Shipped on top of the round-14 bug pass.*

| # | Jo asked | What changed |
|---|---|---|
| 1 | Resize handles don't work while editing (white background) | One guard blocked every drag while a box was open for typing. The handles now resize during editing, and — since they no longer steal keyboard focus — the box stays open with the caret where it was. A size she sets by hand while typing is kept: the shrink-to-fit on Done and the "comfortable" 280-wide editing minimum both stand aside for it. |
| 2 | ✥ grip covered by the editing buttons, and unusable while editing | Same guard, same fix for the grip. The toolbar used to start at the box's left edge, right on top of the grip; it now starts clear of it. |
| 3 | Only the text visible when moving a box | While a grip- or box-drag is in flight the toolbar, handles, outline and white editing background all hide; only the words (and the grip under her pen) remain. The toolbar also hides during a resize, so it can't jump around as the box changes. |
| 4 | Default text size 10 | New calendar text boxes start at 10pt (was 12). Notes keep 18pt; existing boxes keep their own size. |
| 5 | Birthdays, then appointments, then tasks on the same day | Chips were coming back in database order, which for a busy day is effectively shuffled. Every day cell (week and month pages, and the PDF) now lists birthdays, then appointments by clock time (all-day first), then Google Tasks, then reminder chips. Dragged chips keep their pinned spots. |
| 6 | Imported chips bigger — "about 8pt, maybe 10 or 12" | Week-page chips went from 1.4 to 1.9cqw, which is the same on-page size as her 10pt text boxes; month-grid chips 1.05 → 1.4cqw (the cells are a third the width); REMINDERS-panel chips 1.35 → 1.7cqw. The PDF tracks it: 8pt on week pages (was 6.5), 6pt in the month grid (was 5). Four items on one day still use under half the day row. |

## Verification

126 tests (2 new: day-chip ordering incl. tie-breaks, no mutation).
Typecheck clean. Live in the dev preview: text tool created a 10pt box;
with the box open for typing, the east handle widened it 60 px and focus
stayed in the text; the ✥ grip then moved it by exactly the drag
(−30, +25 px) while the toolbar, handles, outline and white background were
gone for the duration and back on release, still editing; Done kept the
hand-set width; four events seeded on Sept 2 rendered as 🎂 Mum · 9:30 AM
Choir · 2:00 PM Dentist · Buy stamps.
