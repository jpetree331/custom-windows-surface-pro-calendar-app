import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFRawStream } from "pdf-lib";
import { db } from "@/lib/db/db";
import { buildPages } from "@/lib/planner/generate";
import { exportPdf } from "./export";

const PLANNER_ID = "pdf-planner";
const OUT_DIR = join(process.cwd(), ".test-output");

async function seed() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.planners.add({
    id: PLANNER_ID, year: 2026, title: "Jo's Planner '26",
    settings: {}, createdAt: 1, updatedAt: 1,
  });
  const pages = buildPages(PLANNER_ID, 2026);
  await db.pages.bulkAdd(pages);
  const wk28 = pages.find((p) => p.dateStart === "2026-07-06")!;
  // ink with pressure
  await db.strokes.bulkAdd([
    {
      id: "s1", pageId: wk28.id, tool: "pen", color: "#d92b2b", width: 1, opacity: 1,
      points: Array.from({ length: 30 }, (_, i) => [80 + i * 8, 200 + Math.sin(i / 3) * 30, 0.3 + i * 0.02]),
      createdAt: 1,
    },
    {
      id: "s2", pageId: wk28.id, tool: "highlighter", color: "#f7e26b", width: 8, opacity: 0.4,
      points: Array.from({ length: 20 }, (_, i) => [100 + i * 10, 320, 0.5]),
      createdAt: 1,
    },
    {
      id: "s3", pageId: wk28.id, tool: "rect", color: "#29abe2", width: 3, opacity: 1,
      points: [[400, 150, 0.5], [520, 260, 0.5]], createdAt: 1,
    },
  ]);
  await db.blocks.add({
    id: "b1", pageId: wk28.id, type: "task", x: 620, y: 160, w: 240, h: 60, z: 1,
    content: "water the plants and feed the fish", checked: false, createdAt: 1, updatedAt: 1,
  });
  await db.habits.add({ id: "h1", plannerId: PLANNER_ID, name: "Walk", cadence: "daily", order: 0, active: true });
  await db.habitChecks.add({ id: "c1", habitId: "h1", date: "2026-07-08", checked: true });
  await db.events.add({
    id: "e1", plannerId: PLANNER_ID, kind: "event", title: "Dentist",
    date: "2026-07-08", startTime: "14:00", endTime: "15:00", allDay: false, updatedAt: 1,
  });
  return pages;
}

beforeEach(seed);

describe("exportPdf", () => {
  it("full year: 79 US-Letter pages with working internal links on every page", async () => {
    const bytes = await exportPdf({ scope: "year", todayISO: "2026-07-08" });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "full-year.pdf"), bytes);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(79);
    const first = doc.getPage(0);
    expect(first.getWidth()).toBe(612);
    expect(first.getHeight()).toBe(792);

    // Every page: 12 month tabs + '26 + 6 side buttons = 19 link annotations.
    const annots = first.node.lookup(PDFName.of("Annots"), PDFArray);
    expect(annots.size()).toBe(19);

    // Tab 6 (JUL) must point at the JULY month page.
    const pages = await db.pages.where("plannerId").equals(PLANNER_ID).sortBy("index");
    const julIndex = pages.findIndex((p) => p.type === "month" && p.monthIndex === 6);
    const julLink = annots.lookup(6, PDFDict);
    const dest = julLink.lookup(PDFName.of("Dest"), PDFArray);
    expect((dest.get(0) as PDFRef).toString()).toBe(doc.getPage(julIndex).ref.toString());

    // '26 corner (13th link) → page 0; Current Week (14th) → week containing Jul 8.
    const yearDest = annots.lookup(12, PDFDict).lookup(PDFName.of("Dest"), PDFArray);
    expect((yearDest.get(0) as PDFRef).toString()).toBe(doc.getPage(0).ref.toString());
    const wkIndex = pages.findIndex((p) => p.dateStart === "2026-07-06");
    const wkDest = annots.lookup(13, PDFDict).lookup(PDFName.of("Dest"), PDFArray);
    expect((wkDest.get(0) as PDFRef).toString()).toBe(doc.getPage(wkIndex).ref.toString());

    // Links present on a deep page too (not just page 1).
    const deep = doc.getPage(50).node.lookup(PDFName.of("Annots"), PDFArray);
    expect(deep.size()).toBe(19);
  }, 30000);

  it("ink, blocks, habits, events land on the inked week page (content stream weight)", async () => {
    const pages = await db.pages.where("plannerId").equals(PLANNER_ID).sortBy("index");
    const wkIndex = pages.findIndex((p) => p.dateStart === "2026-07-06");
    const bytes = await exportPdf({ scope: "year", todayISO: "2026-07-08" });
    const doc = await PDFDocument.load(bytes);
    const pageText = (i: number): string => {
      const page = doc.getPage(i);
      const contents = page.node.lookup(PDFName.of("Contents"));
      const streams: PDFRawStream[] =
        contents instanceof PDFArray
          ? contents.asArray().map((r) => doc.context.lookup(r) as PDFRawStream)
          : [contents as PDFRawStream];
      return streams
        .map((s) => inflateSync(Buffer.from(s.contents)).toString("latin1"))
        .join("\n");
    };
    const inked = pageText(wkIndex);
    const bare = pageText(pages.findIndex((p) => p.dateStart === "2026-08-03"));
    // The inked week page carries far more drawing operators than a bare week.
    expect(inked.length).toBeGreaterThan(bare.length + 1000);
    // Block text, event chip, habit name are drawn as (hex-encoded) text runs.
    const hexOf = (s: string) => Buffer.from(s, "latin1").toString("hex");
    const inkedLower = inked.toLowerCase();
    expect(inkedLower).toContain(hexOf("water the plants"));
    expect(inkedLower).toContain(hexOf("Dentist").toLowerCase());
    expect(inkedLower).toContain(hexOf("Walk").toLowerCase());
    // Highlighter blend mode registers an ExtGState with BM /Multiply.
    const resources = doc.getPage(wkIndex).node.lookup(PDFName.of("Resources"), PDFDict);
    expect(resources.toString()).toContain("/Multiply");
    // Holiday label renders on the JULY month page; moon glyphs draw as circles
    // (Bézier `c` operators are present well beyond the bare template).
    const julIdx = pages.findIndex((p) => p.type === "month" && p.monthIndex === 6);
    const julText = pageText(julIdx).toLowerCase();
    expect(julText).toContain(hexOf("Independence Day").toLowerCase());
    expect((julText.match(/ c\n/g) ?? []).length).toBeGreaterThan(3);
  }, 30000);

  it("duplicated pages get the full link chrome automatically (Jo's Drawboard roadblock)", async () => {
    const { duplicatePage } = await import("@/lib/blocks/actions");
    const pages = await db.pages.where("plannerId").equals(PLANNER_ID).sortBy("index");
    const wk = pages.find((p) => p.dateStart === "2026-07-06")!;
    const copy = await duplicatePage(wk.id);
    const bytes = await exportPdf({ scope: "year", todayISO: "2026-07-08" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(80);
    // The duplicate carries all 19 nav links — nothing to "copy" manually, ever.
    const after = await db.pages.where("plannerId").equals(PLANNER_ID).sortBy("index");
    const copyIdx = after.findIndex((p) => p.id === copy!.id);
    const annots = doc.getPage(copyIdx).node.lookup(PDFName.of("Annots"), PDFArray);
    expect(annots.size()).toBe(19);
    // And its JUL tab still targets the ORIGINAL July month page.
    const julIdx = after.findIndex((p) => p.type === "month" && p.monthIndex === 6);
    const dest = annots.lookup(6, PDFDict).lookup(PDFName.of("Dest"), PDFArray);
    expect((dest.get(0) as PDFRef).toString()).toBe(doc.getPage(julIdx).ref.toString());
  }, 30000);

  it("single page export produces exactly one page", async () => {
    const pages = await db.pages.where("plannerId").equals(PLANNER_ID).sortBy("index");
    const wk = pages.find((p) => p.dateStart === "2026-07-06")!;
    const bytes = await exportPdf({ scope: "page", pageId: wk.id, todayISO: "2026-07-08" });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "single-week.pdf"), bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);
});
