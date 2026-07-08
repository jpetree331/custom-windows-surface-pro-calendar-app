# Feedback Round 1 — Jo's Two Items

*Date: 2026-07-08 · Reference: docs/reference/buttons_2.png*

## 1. "Drawboard couldn't select a group of links and copy them"

**This roadblock does not exist in the new app — by construction.** In Drawboard
every PDF page owned its own link annotations, so each new or duplicated page
meant manually recreating the side-button links. Here:

- **In the app**: the month tabs and side buttons are fixed chrome rendered once
  over the scrolling feed. Every page — including any page Jo duplicates —
  automatically "has" them. There is nothing to select, copy, or maintain, ever.
- **In the PDF export**: the generator stamps all 19 link annotations (12 month
  tabs, '26 corner, 6 side buttons) onto **every page programmatically**.
  New test proves it end-to-end: duplicate a page → export → the duplicate
  carries all 19 links and its JUL tab still jumps to the July month page.

## 2. "Make the ✱ Current Week link automatically update every Monday"

**It already does — better than every Monday.** The ✱ button computes "the week
containing today" fresh on every tap (`currentWeekPageIndex`), so it is always
correct: tap it Sunday night → this week; tap it Monday morning → next week. No
refresh, timer, or new-file-per-week needed (that was a PDF-era limitation).
The logic is now extracted and covered by rollover tests: Sunday→Monday
boundary, month boundaries (weeks interleave with month pages), and outside-year
clamping. 40/40 tests green.

**One honest caveat**: in an *exported PDF*, the ✱ link is frozen to the week of
the export date — a static PDF cannot compute dates. The live app is where ✱
stays current.

## Bonus: Gate C confirmed by buttons_2.png

Jo's own labels: ✱ CURRENT WEEK, T TO-DO LIST, B BUSINESS, H (she doesn't
remember!), N NOTES, 🎂 BIRTHDAY LIST. Our build matches; for **H** we chose
**Habits** (it jumps to the HABITS section page) — flag to Jo that H is hers to
rename in one line (`SIDE_BUTTONS` in `src/lib/planner/constants.ts`) if she
remembers what it was.
