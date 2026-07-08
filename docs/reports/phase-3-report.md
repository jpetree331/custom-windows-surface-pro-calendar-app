# Phase 3 Report — Dates, Holidays, Moon Phases

*Executor: Claude Code · Date: 2026-07-08*

## What was built

- `src/lib/calendar/holidays.ts` — perpetual computed holiday engine: US federal
  set + common observances (Valentine's, St. Patrick's, Good Friday, Easter via
  computus, Mother's/Father's Day, Halloween, Christmas Eve, NYE). Memoized
  `Map<ISO date, names[]>` per year.
- `src/lib/calendar/moon.ts` — principal moon phases from **astronomy-engine**
  (MIT): every new / first-quarter / full / last-quarter instant mapped to its
  local calendar day with 🌑🌓🌕🌗 glyphs.
- Overlays rendered into all three dated templates (week day rows, month cells,
  year mini-grid highlights). Edge weeks that span adjacent years look up the
  neighboring year's tables per day.

## Verify checklist

| Item | Result | Evidence |
|---|---|---|
| Holidays cross-checked vs published list | **PASS** | Unit tests: all 11 published 2026 US federal holiday dates (OPM list) + Easter 2026-04-05 (computus) + Good Friday + 4 observances — 22/22 tests green |
| ≥6 moon dates vs published lunar calendar | **PASS** | 8 anchors from rmg.co.uk / astronomy.com / chani.com / today.com matched within ~1 min: full moons Jan 3 10:02, Feb 1 22:09, Mar 3 11:38, Apr 2 02:12, May 1 17:23 (UTC), blue moon = 2nd May full (May 31); new moons Jan 18 19:52, Mar 19 01:23 |
| Overlays on correct cells | **PASS** | Live screenshot: JULY page shows "Independence Day" in the Jul 4 cell; moon glyphs land Jul 7 / 14 / 21 / 29 exactly matching the ephemeris |
| Overlays never block pen input | **PASS** | Structural: overlays live in the template layer, rendered below BlocksLayer and InkCanvas; the ink canvas receives all pen events (verified drawing still persists post-change via test suite + live check) |
| Data-sovereignty | **PASS** | All computation on-device; no network calls (astronomy-engine is a pure-math library) |

## Deviations

1. **Gate A answered with defaults, not by Jo** (she wasn't reachable in this
   session): US-federal+common holidays; 4 principal moon phases; perpetual
   generator seeded with 2026. Each is a one-line change — see the recon doc.
2. **One published source was wrong**: a search summary claimed an "April 30
   blue moon"; the primary sources (Almanac/today.com) and the ephemeris agree
   the pair is May 1 + May 31 (ET). Tests anchor to the verified instants.
3. **Year page uses highlight dots** instead of holiday text — labels don't fit
   mini-grid cells.
