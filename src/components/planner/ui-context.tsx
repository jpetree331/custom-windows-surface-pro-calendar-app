"use client";

import { createContext, useContext } from "react";
import type { ToolId } from "@/lib/ink/tools";
import type { TimeFormat } from "@/lib/settings";

/** Area selection made with the ⬚ tool: ink strokes + blocks inside a box. */
export interface AreaSelection {
  pageId: string;
  /** Page-unit rect (PAGE_W × PAGE_H space). */
  rect: { x: number; y: number; w: number; h: number };
  strokeIds: string[];
  blockIds: string[];
}

export interface PlannerUI {
  /** Active year's planner — scopes event queries and page actions. */
  plannerId: string;
  /** Active planner year (for templates that print it, e.g. Birthdays). */
  year: number;
  tool: ToolId;
  penColor: string;
  penWidth: number;
  setTool: (t: ToolId) => void;
  setPen: (color: string, width: number) => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  /** Page currently centered in the viewport — paste target. */
  currentPageId: string | null;
  /** Jump to the week page containing this ISO date (month-grid day tap). */
  jumpToDate: (iso: string) => void;
  /** Suppress touch scrolling while the pen is down (palm rejection). */
  setPenActive: (active: boolean) => void;
  /** Manual one-finger touch pan (ink canvas owns all gestures now). */
  panBy: (dx: number, dy: number) => void;
  /** Book-style page flip (touch swipe); scrolls a screen in continuous mode. */
  flipPage: (dir: 1 | -1) => void;
  /** Active ⬚ area selection, if any. */
  selection: AreaSelection | null;
  setSelection: (s: AreaSelection | null) => void;
  /** How event times display: "2:00 PM" vs "14:00". */
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
}

export const PlannerUIContext = createContext<PlannerUI | null>(null);

export function usePlannerUI(): PlannerUI {
  const ctx = useContext(PlannerUIContext);
  if (!ctx) throw new Error("usePlannerUI outside provider");
  return ctx;
}
