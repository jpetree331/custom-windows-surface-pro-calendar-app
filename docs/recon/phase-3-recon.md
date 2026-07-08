# Phase 3 Recon — Dates, Holidays, Moon Phases

## Gate A resolution (autonomous defaults — flagged for Jo's confirmation)

Jo wasn't available to answer Gate A, so Phase 3 shipped with documented,
easily-changed defaults:

| Question | Default chosen | To change |
|---|---|---|
| Holiday scope | US federal + common observances (20 rules) | edit `HOLIDAY_RULES` in `src/lib/calendar/holidays.ts` |
| Moon phases | 4 principal phases (new / first quarter / full / last quarter) | render all 8 by adding intermediate-phase glyphs in `moon.ts` |
| Year range | Perpetual generators (any year), planner seeded for 2026 | `PLANNER_YEAR` constant |

## Holiday source

Computed, not hardcoded: fixed dates, nth/last-weekday rules, and Gregorian
Easter via the Meeus/Jones/Butcher computus (Good Friday derived). Memoized per
year. Validation: unit tests assert every 2026 federal holiday against the
published OPM dates, plus Easter/observances.

## Moon-phase method

**astronomy-engine 2.1.19** (MIT, pure TS ephemeris, arc-minute accuracy):
`SearchMoonQuarter`/`NextMoonQuarter` walk all principal-phase instants in the
year; each instant is mapped to the device's local calendar day. Validation:
unit tests cross-check 8 published anchors (rmg.co.uk / astronomy.com /
chani.com / today.com) — all match within ~1 minute.

## Overlay placement

Overlays are part of the page templates, which render **below** the blocks layer
and ink canvas — so they can never intercept pen input (z-order guarantee).
- WEEK day rows: holiday label + moon glyph, top-right of the day's note area.
- MONTH cells: moon glyph beside the date number, holiday label at cell bottom.
- YEAR mini-grids: holiday dates get a soft highlight dot (labels don't fit).
