"use client";

import { createContext, useContext } from "react";
import type { ToolId } from "@/lib/ink/tools";

export interface PlannerUI {
  tool: ToolId;
  penColor: string;
  penWidth: number;
  setTool: (t: ToolId) => void;
  setPen: (color: string, width: number) => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  /** Page currently centered in the viewport — paste target. */
  currentPageId: string | null;
  /** Suppress touch scrolling while the pen is down (palm rejection). */
  setPenActive: (active: boolean) => void;
}

export const PlannerUIContext = createContext<PlannerUI | null>(null);

export function usePlannerUI(): PlannerUI {
  const ctx = useContext(PlannerUIContext);
  if (!ctx) throw new Error("usePlannerUI outside provider");
  return ctx;
}
