# Feedback Round 2 — Jo's 8-item list

*Date: 2026-07-13 · All items shipped except where noted. 51/51 tests green.*

| # | Jo asked | Status |
|---|---|---|
| 1 | Single Page layout + Fit to Page as defaults | **Shipped.** ⿹ View menu: Single Page (page-by-page flips via wheel-at-edge, PageUp/Down, ‹ › buttons, "n / 79" indicator) or Single Page Continuous (the original scroll). Fit to Page / Width / Height. Opens on the current week. Double Page modes deliberately omitted (she said she doesn't use them). |
| 2 | Right-click menu (Add / Copy / Duplicate / Delete page) | **Shipped.** Right-click (or pen long-press) any page: Add page after…, Copy page, Paste page after (appears once something is copied — content travels with it), Duplicate page, Delete page (inline confirm; Ctrl+Z restores everything). Rotate/OCR omitted — not applicable to a live app. |
| 3 | Her 7 category colors as pens; editable colors; adjustable thickness | **Shipped.** Pens are now exactly her palette (Appointments #3DC9FD → Misc. #000000); categories seeded to match (untouched legacy installs auto-upgrade). Tap the active pen again → color picker + 0.5–4pt thickness slider per slot (persisted). Text boxes inherit the active pen color (app + PDF export). |
| 4 | "Cleaning" → "Reminders" | **Shipped** (app template + PDF export). |
| 5 | How to import birthdays / export appointments to Google | **Already built** — documented in the reply + google-setup.md: ⚙ → Connect & sync now (imports events + birthdays onto the right days); ⚙ → Create in Google form (pushes an appointment with reminder/attendees). |
| 6 | Click a day number on a month page → jump to its week | **Shipped.** Day numbers are now buttons (elevated above the ink layer, so a pen tap navigates instead of drawing). Verified live: JUL page day 25 → WEEK 30. |
| 7 | Keep the toolbar visible when zooming | **Shipped** via app-level zoom (− / % / ＋ in the toolbar, 50–300%): pages scale, chrome stays put, panning stays native. Browser pinch-zoom still zooms everything — the in-app zoom is the one to teach her. |
| 8 | What happens after 2026? | **Shipped.** ▾ next to the year corner → switch years or "＋ Start 2027". The new year generates instantly (2027 = 52 ISO weeks, verified) and inherits her categories + active habits. Everything else (backups, exports, Google) is year-aware. |

## Verified live (dev server, DOM-driven)

Current-week landing hit WEEK 29 on real today (Mon Jul 13 — the Monday
rollover working in production conditions) · page flips · REMINDERS label ·
month-day jump · context menu incl. copy→paste (page counts 79→80) · zoom
125% with toolbar visible · 2027 creation (78 pages) and year switching ·
settings persistence. **Bug found & fixed during verify:** switching years
computed the landing page from the previous year's page list (state/liveQuery
race) — now guarded.

Continuous mode re-verify was blocked by the known hidden-preview-window
rendering suspension (see memory note); its only change this round is a width
style, and it remains covered by the Phase 1 measurements.

## Notes for the owner

- Jo's device gets the new palette automatically only because her categories
  were never edited; if she HAS edited them, her set is respected (by design).
- Delete page works on any page type; calendar pages reappear via Ctrl+Z or
  by re-adding a year… but there's no "regenerate missing week" — advise
  deleting only extra/section pages.
