import {
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  PDFRef,
  StandardFonts,
  rgb,
  degrees,
  BlendMode,
  type RGB,
} from "pdf-lib";
import { getStroke } from "perfect-freehand";
import { db } from "@/lib/db/db";
import type { Block, Habit, HabitCheck, Page, PlannerEvent, Stroke } from "@/lib/db/types";
import { PAGE_W, PAGE_H, SECTIONS, SIDE_BUTTONS, HABIT_REGION } from "@/lib/planner/constants";
import { MONTH_ABBR, MONTH_NAMES, DAY_ABBR, addDays, fromISO, toISO, daysInMonth, firstDowOfMonth } from "@/lib/planner/dates";
import { holidaysForYear } from "@/lib/calendar/holidays";
import { moonPhasesForYear } from "@/lib/calendar/moon";
import { PT_TO_UNITS, HIGHLIGHTER_OPACITY } from "@/lib/ink/tools";

/** US Letter — aspect 0.773 vs the logical page's 0.769: near-perfect fit. */
const PT_W = 612;
const PT_H = 792;
const S = PT_H / PAGE_H; // 0.6092 pt per logical unit
const OX = (PT_W - PAGE_W * S) / 2;

const px = (x: number) => OX + x * S;
const py = (y: number) => PT_H - y * S;

function hex(c: string): RGB {
  const v = c.replace("#", "");
  return rgb(
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255
  );
}

const INK_BLACK = hex("#1a1a1a");
const DATE_BLUE = hex("#3fa9f5");
const LABEL_BLUE = hex("#2b6fb3");
const GRID_BLUE = hex("#8fb8d0");

/** Strip characters Helvetica/WinAnsi can't encode (emoji etc.). */
function safe(text: string): string {
  return [...text].filter((ch) => ch.charCodeAt(0) <= 255).join("");
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pages: Page[];
  pdfPages: PDFPage[];
  year: number;
  todayISO: string;
  strokesByPage: Map<string, Stroke[]>;
  blocksByPage: Map<string, Block[]>;
  eventsByDate: Map<string, PlannerEvent[]>;
  categoryColor: Map<string, string>;
  habits: Habit[];
  checks: Set<string>; // habitId|date
}

/* ---------------------------------- chrome --------------------------------- */

const TAB_H = 26; // logical units

function drawGradient(page: PDFPage) {
  const strips = 40;
  const mint = [0xd9, 0xf5, 0xdc];
  const sky = [0xa9, 0xc6, 0xf7];
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const c = rgb(
      (mint[0] + (sky[0] - mint[0]) * t) / 255,
      (mint[1] + (sky[1] - mint[1]) * t) / 255,
      (mint[2] + (sky[2] - mint[2]) * t) / 255
    );
    page.drawRectangle({
      x: (PT_W / strips) * i,
      y: 0,
      width: PT_W / strips + 1,
      height: PT_H,
      color: c,
    });
  }
}

interface LinkSpec {
  rect: [number, number, number, number]; // pdf pts [x1 y1 x2 y2]
  targetIndex: number;
}

function chromeLinks(ctx: Ctx): { draw: (page: PDFPage) => void; links: LinkSpec[] } {
  const links: LinkSpec[] = [];
  const tabW = (PAGE_W - 60) / 12;
  const monthTargets = MONTH_ABBR.map((_, m) =>
    ctx.pages.findIndex((p) => p.type === "month" && p.monthIndex === m)
  );
  const weekTarget = (() => {
    const exact = ctx.pages.findIndex(
      (p) => p.type === "week" && p.dateStart <= ctx.todayISO && ctx.todayISO <= p.dateEnd
    );
    if (exact >= 0) return exact;
    return ctx.pages.findIndex((p) => p.type === "week");
  })();
  const sectionTarget = (key: string) =>
    ctx.pages.findIndex((p) => p.type === "section" && p.meta.sectionKey === key);

  // Precompute link rects (same on every page).
  for (let m = 0; m < 12; m++) {
    links.push({
      rect: [px(m * tabW), py(TAB_H), px((m + 1) * tabW), py(0)],
      targetIndex: monthTargets[m],
    });
  }
  links.push({ rect: [px(12 * tabW), py(TAB_H), px(PAGE_W), py(0)], targetIndex: 0 });

  const BTN = 34;
  SIDE_BUTTONS.forEach((b, i) => {
    const top = TAB_H + 14 + i * (BTN + 8);
    links.push({
      rect: [px(PAGE_W - BTN - 4), py(top + BTN), px(PAGE_W - 4), py(top)],
      targetIndex: b.target === "current-week" ? weekTarget : sectionTarget(b.target),
    });
  });

  const draw = (page: PDFPage) => {
    // month tabs
    for (let m = 0; m < 12; m++) {
      page.drawRectangle({
        x: px(m * tabW),
        y: py(TAB_H),
        width: tabW * S - 1,
        height: TAB_H * S - 2,
        color: hex("#eef0f3"),
        borderColor: hex("#9aa1ab"),
        borderWidth: 0.6,
      });
      const label = MONTH_ABBR[m];
      const size = 8;
      page.drawText(label, {
        x: px(m * tabW) + (tabW * S - ctx.bold.widthOfTextAtSize(label, size)) / 2,
        y: py(TAB_H) + 5,
        size,
        font: ctx.bold,
        color: INK_BLACK,
      });
    }
    const yearLabel = `'${String(ctx.year).slice(2)}`;
    page.drawText(yearLabel, {
      x: px(12 * tabW) + 6,
      y: py(TAB_H) + 5,
      size: 9,
      font: ctx.bold,
      color: INK_BLACK,
    });
    // side buttons
    const BTN = 34;
    const glyphs = ["*", "T", "B", "H", "N", "BD"];
    const colors = ["#5a6cf0", "#3fa9f5", "#6dbb3c", "#f2599a", "#f28d49", "#f6d5e2"];
    SIDE_BUTTONS.forEach((b, i) => {
      const top = TAB_H + 14 + i * (BTN + 8);
      page.drawRectangle({
        x: px(PAGE_W - BTN - 4),
        y: py(top + BTN),
        width: BTN * S,
        height: BTN * S,
        color: hex(colors[i]),
        borderColor: rgb(1, 1, 1),
        borderWidth: 0.8,
        opacity: 0.95,
      });
      const g = glyphs[i];
      const size = g.length > 1 ? 7 : 11;
      page.drawText(g, {
        x: px(PAGE_W - BTN - 4) + (BTN * S - ctx.bold.widthOfTextAtSize(g, size)) / 2,
        y: py(top + BTN) + (BTN * S - size) / 2 + 1,
        size,
        font: ctx.bold,
        color: INK_BLACK,
      });
    });
  };

  return { draw, links };
}

function applyLinks(ctx: Ctx, page: PDFPage, links: LinkSpec[]) {
  const refs: PDFRef[] = [];
  for (const l of links) {
    if (l.targetIndex < 0) continue;
    const target = ctx.pdfPages[l.targetIndex];
    const dest = ctx.doc.context.obj([target.ref, PDFName.of("XYZ"), null, null, null]);
    const annot = ctx.doc.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: l.rect,
      Border: [0, 0, 0],
      Dest: dest,
    });
    refs.push(ctx.doc.context.register(annot));
  }
  page.node.set(PDFName.of("Annots"), ctx.doc.context.obj(refs));
}

/* ------------------------------- day markings ------------------------------ */

function drawMoon(page: PDFPage, cx: number, cy: number, r: number, quarter: number) {
  if (quarter === 0) {
    page.drawCircle({ x: cx, y: cy, size: r, color: hex("#3b4252") });
  } else if (quarter === 2) {
    page.drawCircle({ x: cx, y: cy, size: r, color: rgb(1, 1, 0.85), borderColor: INK_BLACK, borderWidth: 0.5 });
  } else {
    page.drawCircle({ x: cx, y: cy, size: r, color: rgb(1, 1, 1), borderColor: INK_BLACK, borderWidth: 0.5 });
    // filled half: right for first quarter, left for last (y-down SVG semantics)
    const d =
      quarter === 1
        ? `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`
        : `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} Z`;
    page.drawSvgPath(d, { x: cx, y: cy, color: hex("#3b4252") });
  }
}

function drawDayMarks(
  ctx: Ctx,
  page: PDFPage,
  iso: string,
  box: { x: number; y: number; w: number; h: number }, // logical, y = top
  compact: boolean
) {
  const year = Number(iso.slice(0, 4));
  const holidays = holidaysForYear(year).get(iso);
  const moon = moonPhasesForYear(year).get(iso);
  let cursorRight = box.x + box.w - 6;
  if (moon) {
    const r = compact ? 4 : 5;
    drawMoon(page, px(cursorRight - r), py(box.y + 8), r * S * 1.4, moon.quarter);
    cursorRight -= r * 2 + 8;
  }
  if (holidays) {
    const size = compact ? 5 : 6.5;
    const text = safe(holidays.join(" - "));
    const w = ctx.bold.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: compact ? px(box.x + 3) : px(cursorRight) - w,
      y: compact ? py(box.y + box.h - 3) : py(box.y + 12),
      size,
      font: ctx.bold,
      color: LABEL_BLUE,
    });
  }
  const events = ctx.eventsByDate.get(iso) ?? [];
  const max = compact ? 3 : 5;
  events.slice(0, max).forEach((e, i) => {
    const size = compact ? 5 : 6.5;
    const rowH = size + 3;
    const yTop = compact ? box.y + 12 + i * rowH : box.y + box.h - (max - i) * rowH - 4;
    const color = ctx.categoryColor.get(e.categoryId ?? "") ?? (e.kind === "birthday" ? "#f2599a" : "#3fa9f5");
    const label = safe(`${e.kind === "birthday" ? "* " : ""}${e.startTime ? e.startTime + " " : ""}${e.title}`);
    const w = Math.min(ctx.font.widthOfTextAtSize(label, size) + 4, (box.w - 8) * S);
    page.drawRectangle({
      x: px(box.x + 3),
      y: py(yTop + rowH - 1),
      width: w,
      height: rowH - 1.5,
      color: hex(color),
      opacity: 0.9,
    });
    page.drawText(label, {
      x: px(box.x + 3) + 2,
      y: py(yTop + rowH - 1) + 2,
      size,
      font: ctx.font,
      color: rgb(1, 1, 1),
      maxWidth: w,
    });
  });
}

/* -------------------------------- templates -------------------------------- */

const INSET = 12; // logical page inset used by templates

function drawWeek(ctx: Ctx, page: PDFPage, p: Page) {
  const monday = fromISO(p.dateStart);
  const left = INSET;
  const top = TAB_H + 6;
  const right = PAGE_W - INSET;
  const bottom = PAGE_H - INSET;
  const splitX = left + (right - left) * 0.57;
  const rowH = (bottom - top) / 7;

  page.drawRectangle({
    x: px(left), y: py(bottom), width: (right - left) * S, height: (bottom - top) * S,
    borderColor: INK_BLACK, borderWidth: 1.1,
  });
  page.drawLine({ start: { x: px(splitX), y: py(top) }, end: { x: px(splitX), y: py(bottom) }, thickness: 1.1, color: INK_BLACK });

  for (let i = 0; i < 7; i++) {
    const rowTop = top + i * rowH;
    const d = addDays(monday, i);
    if (i > 0) {
      page.drawLine({ start: { x: px(left), y: py(rowTop) }, end: { x: px(splitX), y: py(rowTop) }, thickness: 1.1, color: INK_BLACK });
    }
    // date column
    const colW = 46;
    page.drawLine({ start: { x: px(left + colW), y: py(rowTop) }, end: { x: px(left + colW), y: py(rowTop + rowH) }, thickness: 1.1, color: INK_BLACK });
    page.drawText(String(d.getDate()), { x: px(left + 5), y: py(rowTop + 26), size: 16, font: ctx.bold, color: DATE_BLUE });
    const letters = DAY_ABBR[i];
    letters.split("").forEach((ch, j) => {
      page.drawText(ch, {
        x: px(left + colW / 2) - ctx.bold.widthOfTextAtSize(ch, 11) / 2,
        y: py(rowTop + rowH / 2 + 10 + (j - 1) * 22),
        size: 11, font: ctx.bold, color: INK_BLACK,
      });
    });
    drawDayMarks(ctx, page, toISO(d), { x: left + colW, y: rowTop, w: splitX - left - colW, h: rowH }, false);
  }

  // right column: TASKS / CLEANING
  const cleanY = top + (bottom - top) * 0.52;
  page.drawLine({ start: { x: px(splitX), y: py(cleanY) }, end: { x: px(right), y: py(cleanY) }, thickness: 1.1, color: INK_BLACK });
  const pill = (text: string, x: number, yTop: number) => {
    const w = ctx.bold.widthOfTextAtSize(text, 10) + 12;
    page.drawRectangle({ x: px(x), y: py(yTop + 20), width: w, height: 14, color: hex("#a8c8ee"), opacity: 0.85 });
    page.drawText(text, { x: px(x) + 6, y: py(yTop + 20) + 3.5, size: 10, font: ctx.bold, color: INK_BLACK });
  };
  pill("TASKS", splitX + 8, top + 4);
  pill("CLEANING", splitX + 8, cleanY + 4);

  // habits grid with real data
  const gx = (HABIT_REGION.left / 100) * PAGE_W;
  const gw = (HABIT_REGION.width / 100) * PAGE_W;
  const gBottom = PAGE_H - (HABIT_REGION.bottom / 100) * PAGE_H;
  const gh = (HABIT_REGION.height / 100) * PAGE_H;
  const gTop = gBottom - gh;
  const rows = Math.max(9, ctx.habits.length) + 1;
  const gRowH = gh / rows;
  const nameW = gw * 0.3;
  const dayW = (gw - nameW) / 7;
  page.drawRectangle({ x: px(gx), y: py(gBottom), width: gw * S, height: gh * S, color: rgb(1, 1, 1), opacity: 0.45 });
  for (let r = 0; r <= rows; r++) {
    page.drawLine({ start: { x: px(gx), y: py(gTop + r * gRowH) }, end: { x: px(gx + gw), y: py(gTop + r * gRowH) }, thickness: 0.5, color: GRID_BLUE });
  }
  for (let c = 0; c <= 8; c++) {
    const x = c === 0 ? gx : gx + nameW + (c - 1) * dayW;
    page.drawLine({ start: { x: px(x), y: py(gTop) }, end: { x: px(x), y: py(gBottom) }, thickness: 0.5, color: GRID_BLUE });
  }
  page.drawText("HABITS", { x: px(gx + 4), y: py(gTop + gRowH) + 2, size: 6.5, font: ctx.bold, color: INK_BLACK });
  DAY_ABBR.forEach((dName, c) => {
    page.drawText(dName, {
      x: px(gx + nameW + c * dayW + dayW / 2) - ctx.font.widthOfTextAtSize(dName, 5.5) / 2,
      y: py(gTop + gRowH) + 2, size: 5.5, font: ctx.font, color: INK_BLACK,
    });
  });
  ctx.habits.forEach((h, r) => {
    const rowTop = gTop + (r + 1) * gRowH;
    page.drawText(safe(h.name).slice(0, 22), { x: px(gx + 4), y: py(rowTop + gRowH) + 2, size: 6, font: ctx.font, color: INK_BLACK });
    for (let c = 0; c < 7; c++) {
      const dayIso = toISO(addDays(monday, c));
      const key = h.cadence === "weekly" ? `${h.id}|${toISO(monday)}` : `${h.id}|${dayIso}`;
      if (ctx.checks.has(key)) {
        const cx0 = gx + nameW + c * dayW + dayW / 2;
        const cy0 = rowTop + gRowH / 2;
        page.drawLine({ start: { x: px(cx0 - 4), y: py(cy0 + 1) }, end: { x: px(cx0 - 1), y: py(cy0 + 4) }, thickness: 1, color: hex("#2b7a2b") });
        page.drawLine({ start: { x: px(cx0 - 1), y: py(cy0 + 4) }, end: { x: px(cx0 + 5), y: py(cy0 - 4) }, thickness: 1, color: hex("#2b7a2b") });
        if (h.cadence === "weekly") break; // one check spans the week
      }
    }
  });

  // vertical month tag
  page.drawText(MONTH_NAMES[p.monthIndex], {
    x: px(PAGE_W - 8),
    y: py(PAGE_H / 2 - 40),
    size: 13,
    font: ctx.bold,
    color: hex("#3fc4f5"),
    rotate: degrees(-90),
  });
}

function drawMonth(ctx: Ctx, page: PDFPage, p: Page) {
  const year = ctx.year;
  const m = p.monthIndex;
  const left = INSET;
  const top = TAB_H + 10;
  const right = PAGE_W - INSET;
  const bottom = PAGE_H - INSET;
  page.drawText(p.label, { x: px(left), y: py(top + 26), size: 20, font: ctx.bold, color: INK_BLACK });
  const gridTop = top + 40;
  const headH = 18;
  const lead = firstDowOfMonth(year, m);
  const count = daysInMonth(year, m);
  const rows = Math.ceil((lead + count) / 7);
  const colW = (right - left) / 7;
  const rowH = (bottom - gridTop - headH) / rows;
  // header
  page.drawRectangle({ x: px(left), y: py(gridTop + headH), width: (right - left) * S, height: headH * S, color: rgb(1, 1, 1), opacity: 0.4 });
  DAY_ABBR.forEach((d, c) => {
    page.drawText(d, {
      x: px(left + c * colW + colW / 2) - ctx.bold.widthOfTextAtSize(d, 9) / 2,
      y: py(gridTop + headH) + 4, size: 9, font: ctx.bold, color: INK_BLACK,
    });
  });
  for (let r = 0; r <= rows; r++) {
    page.drawLine({ start: { x: px(left), y: py(gridTop + headH + r * rowH) }, end: { x: px(right), y: py(gridTop + headH + r * rowH) }, thickness: 0.8, color: INK_BLACK });
  }
  for (let c = 0; c <= 7; c++) {
    page.drawLine({ start: { x: px(left + c * colW), y: py(gridTop) }, end: { x: px(left + c * colW), y: py(bottom) }, thickness: 0.8, color: INK_BLACK });
  }
  page.drawLine({ start: { x: px(left), y: py(gridTop) }, end: { x: px(right), y: py(gridTop) }, thickness: 0.8, color: INK_BLACK });
  for (let day = 1; day <= count; day++) {
    const idx = lead + day - 1;
    const r = Math.floor(idx / 7);
    const c = idx % 7;
    const cellTop = gridTop + headH + r * rowH;
    page.drawText(String(day), { x: px(left + c * colW + 4), y: py(cellTop + 16), size: 11, font: ctx.bold, color: DATE_BLUE });
    const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    drawDayMarks(ctx, page, iso, { x: left + c * colW, y: cellTop, w: colW, h: rowH }, true);
  }
}

function drawYear(ctx: Ctx, page: PDFPage, p: Page) {
  const year = ctx.year;
  page.drawText(p.label, { x: px(INSET + 6), y: py(TAB_H + 40), size: 26, font: ctx.bold, color: INK_BLACK });
  const top = TAB_H + 56;
  const left = INSET + 4;
  const right = PAGE_W - INSET - 4;
  const bottom = PAGE_H - INSET - 4;
  const cellW = (right - left) / 3;
  const cellH = (bottom - top) / 4;
  const holidays = holidaysForYear(year);
  for (let m = 0; m < 12; m++) {
    const gx = left + (m % 3) * cellW;
    const gy = top + Math.floor(m / 3) * cellH;
    page.drawRectangle({ x: px(gx + 3), y: py(gy + cellH - 3), width: (cellW - 6) * S, height: (cellH - 6) * S, color: rgb(1, 1, 1), opacity: 0.35 });
    page.drawText(MONTH_NAMES[m], {
      x: px(gx + cellW / 2) - ctx.bold.widthOfTextAtSize(MONTH_NAMES[m], 8) / 2,
      y: py(gy + 16), size: 8, font: ctx.bold, color: LABEL_BLUE,
    });
    const lead = firstDowOfMonth(year, m);
    const count = daysInMonth(year, m);
    const dW = (cellW - 16) / 7;
    const dH = (cellH - 34) / 7;
    "MTWTFSS".split("").forEach((ch, c) => {
      page.drawText(ch, { x: px(gx + 8 + c * dW + dW / 2 - 2), y: py(gy + 28), size: 5.5, font: ctx.bold, color: hex("#5a6472") });
    });
    for (let day = 1; day <= count; day++) {
      const idx = lead + day - 1;
      const r = Math.floor(idx / 7) + 1;
      const c = idx % 7;
      const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const x = gx + 8 + c * dW + dW / 2;
      const y = gy + 28 + r * dH;
      if (holidays.has(iso)) {
        page.drawCircle({ x: px(x) + 1, y: py(y) + 2, size: 4, color: hex("#7db8e8"), opacity: 0.5 });
      }
      const label = String(day);
      page.drawText(label, { x: px(x) - ctx.font.widthOfTextAtSize(label, 5.5) / 2 + 1, y: py(y), size: 5.5, font: ctx.font, color: INK_BLACK });
    }
  }
}

function drawSection(ctx: Ctx, page: PDFPage, p: Page) {
  const text = safe(p.label);
  const w = ctx.bold.widthOfTextAtSize(text, 12) + 16;
  page.drawRectangle({ x: px(INSET), y: py(TAB_H + 30), width: w, height: 17, color: hex("#a8c8ee"), opacity: 0.85 });
  page.drawText(text, { x: px(INSET) + 8, y: py(TAB_H + 30) + 4, size: 12, font: ctx.bold, color: INK_BLACK });
}

/* ----------------------------- ink & blocks ----------------------------- */

function strokeToSvgPath(stroke: Stroke): string {
  const hasRealPressure = stroke.points.some((pt) => pt[2] !== 0.5);
  const outline = getStroke(stroke.points, {
    size: stroke.width * PT_TO_UNITS * (stroke.tool === "highlighter" ? 1 : 2.2),
    thinning: stroke.tool === "highlighter" ? 0 : 0.55,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: !hasRealPressure,
    last: true,
  });
  if (outline.length === 0) return "";
  return (
    `M ${outline[0][0].toFixed(1)} ${outline[0][1].toFixed(1)} ` +
    outline.slice(1).map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
    " Z"
  );
}

async function drawBlocksAndInk(ctx: Ctx, page: PDFPage, p: Page) {
  for (const b of ctx.blocksByPage.get(p.id) ?? []) {
    if (b.type === "image" && b.imageBlob) {
      try {
        const bytes = new Uint8Array(await b.imageBlob.arrayBuffer());
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        const img = isPng ? await ctx.doc.embedPng(bytes) : await ctx.doc.embedJpg(bytes);
        page.drawImage(img, { x: px(b.x), y: py(b.y + b.h), width: b.w * S, height: b.h * S });
      } catch {
        // unsupported format — skip rather than fail the export
      }
      continue;
    }
    const color = ctx.categoryColor.get(b.categoryId ?? "");
    if (color) {
      page.drawRectangle({ x: px(b.x), y: py(b.y + b.h), width: b.w * S, height: b.h * S, color: hex(color), opacity: 0.12 });
      page.drawRectangle({ x: px(b.x), y: py(b.y + b.h), width: 2.5, height: b.h * S, color: hex(color) });
    }
    const size = 9;
    const prefix = b.type === "task" ? (b.checked ? "[x] " : "[ ] ") : "";
    // Preserve the user's line breaks; wrap each source line independently.
    let yCursor = b.y + 14;
    outer: for (const srcLine of safe(prefix + b.content).split("\n")) {
      let line = "";
      for (const word of srcLine.split(/[ \t]+/)) {
        const probe = line ? `${line} ${word}` : word;
        if (ctx.font.widthOfTextAtSize(probe, size) > (b.w - 10) * S && line) {
          page.drawText(line, { x: px(b.x + 4), y: py(yCursor), size, font: ctx.font, color: INK_BLACK });
          line = word;
          yCursor += 16;
          if (yCursor > b.y + b.h) break outer;
        } else {
          line = probe;
        }
      }
      if (line) {
        page.drawText(line, { x: px(b.x + 4), y: py(yCursor), size, font: ctx.font, color: INK_BLACK });
        yCursor += 16;
        if (yCursor > b.y + b.h) break;
      }
    }
  }

  for (const s of ctx.strokesByPage.get(p.id) ?? []) {
    if (s.tool === "rect") {
      const [a, b2] = [s.points[0], s.points[s.points.length - 1]];
      page.drawRectangle({
        x: px(Math.min(a[0], b2[0])),
        y: py(Math.max(a[1], b2[1])),
        width: Math.abs(b2[0] - a[0]) * S,
        height: Math.abs(b2[1] - a[1]) * S,
        borderColor: hex(s.color),
        borderWidth: s.width * PT_TO_UNITS * S,
      });
      continue;
    }
    const d = strokeToSvgPath(s);
    if (!d) continue;
    page.drawSvgPath(d, {
      x: px(0),
      y: py(0),
      scale: S,
      color: hex(s.color),
      opacity: s.tool === "highlighter" ? HIGHLIGHTER_OPACITY : s.opacity,
      blendMode: s.tool === "highlighter" ? BlendMode.Multiply : undefined,
    });
  }
}

/* --------------------------------- export --------------------------------- */

export interface ExportOptions {
  scope: "year" | "page";
  /** required when scope === "page" */
  pageId?: string;
  todayISO?: string;
}

/** Render the planner (or one page) to a hyperlinked, printable PDF. */
export async function exportPdf(opts: ExportOptions): Promise<Uint8Array> {
  const planner = (await db.planners.toCollection().first())!;
  const allPages = await db.pages
    .where("[plannerId+index]")
    .between([planner.id, -Infinity], [planner.id, Infinity])
    .toArray();
  const pages = opts.scope === "year" ? allPages : allPages.filter((p) => p.id === opts.pageId);
  if (pages.length === 0) throw new Error("Nothing to export");

  const [strokes, blocks, events, categories, habits, checks] = await Promise.all([
    db.strokes.toArray(),
    db.blocks.toArray(),
    db.events.toArray(),
    db.categories.toArray(),
    db.habits.where("plannerId").equals(planner.id).sortBy("order"),
    db.habitChecks.toArray(),
  ]);

  const doc = await PDFDocument.create();
  doc.setTitle(`${planner.title} — Jo's Planner`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const group = <T extends { pageId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const arr = m.get(r.pageId) ?? [];
      arr.push(r);
      m.set(r.pageId, arr);
    }
    return m;
  };
  const eventsByDate = new Map<string, PlannerEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.date) ?? [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }

  const ctx: Ctx = {
    doc,
    font,
    bold,
    pages,
    pdfPages: [],
    year: planner.year,
    todayISO: opts.todayISO ?? toISO(new Date()),
    strokesByPage: group(strokes),
    blocksByPage: group(blocks),
    eventsByDate,
    categoryColor: new Map(categories.map((c) => [c.id, c.color])),
    habits: habits.filter((h) => h.active),
    checks: new Set(
      (checks as HabitCheck[]).filter((c) => c.checked).map((c) => `${c.habitId}|${c.date}`)
    ),
  };

  // pass 1: create pages so links can reference any target
  for (let i = 0; i < pages.length; i++) ctx.pdfPages.push(doc.addPage([PT_W, PT_H]));

  const chrome = chromeLinks(ctx);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const page = ctx.pdfPages[i];
    drawGradient(page);
    if (p.type === "week") drawWeek(ctx, page, p);
    else if (p.type === "month") drawMonth(ctx, page, p);
    else if (p.type === "year") drawYear(ctx, page, p);
    else drawSection(ctx, page, p);
    await drawBlocksAndInk(ctx, page, p);
    chrome.draw(page);
    if (opts.scope === "year") applyLinks(ctx, page, chrome.links);
  }

  return doc.save();
}
