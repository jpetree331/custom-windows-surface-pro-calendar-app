# Phase 1 Recon — Planner Spine

## Virtualization choice

**react-virtuoso** over a custom IntersectionObserver: it gives dynamic
measurement of variable-height items, overscan control (`increaseViewportBy`),
`scrollToIndex` (the anchor/jump mechanism), and `rangeChanged` (drives the
active-month tab highlight) out of the box. A custom observer would re-implement
all four. Page heights are near-uniform (fixed aspect ratio from `PAGE_W×PAGE_H`
= 1000×1300 logical units) which is virtuoso's easy case.

## Component tree

```
PlannerShell (client; loads planner + 79 pages from Dexie, owns VirtuosoHandle)
├─ TopBar           JAN…DEC tabs + '26 corner → jumpToMonth / jumpToYear
├─ SideButtons      ✱ T B H N 🎂 → jumpToTarget (Gate C legend)
└─ Virtuoso
   └─ PageView (dispatch on page.type)
      ├─ WeekPage    7 day rows (blue date #, stacked day letters) |
      │              TASKS / CLEANING / HABITS-grid right column, vertical month tag
      ├─ MonthPage   Mon-start grid, blue date numbers
      ├─ YearPage    12 mini-month grids
      └─ SectionPage label pill + open surface
   (all inside PageFrame: gradient sheet, aspect-ratio, container-type:inline-size
    so template text scales in cqw units — 1cqw = 10 logical page units)
```

## Anchor / jump mechanism

All pages live in one ordered array (Dexie `[plannerId+index]`). Jumps resolve a
predicate to an array index and call
`virtuoso.scrollToIndex({ index, align: 'start', behavior: 'smooth' })`:

- month tab *m* → first page `type==='month' && monthIndex===m`
- side button → first page `meta.sectionKey === target`
- ✱ Current Week → week page whose `dateStart ≤ today ≤ dateEnd` (clamped to
  first/last week outside the planner year)
- '26 corner → index 0 (year page)

Active-month highlight: `rangeChanged` → middle visible page's `monthIndex`
(year/section pages keep the previous highlight).

## Week ownership rule

A week belongs to the month containing its **Thursday** (ISO 8601), giving 53
weeks for 2026 with no orphan dates; weeks interleave after their month page.
