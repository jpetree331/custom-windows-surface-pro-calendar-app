"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";

/** Shared with the text menu — the selection recolor row remembers the same
 *  last custom pick, so Jo's color follows her between the two. */
export const LAST_CUSTOM_KEY = "jotter.lastTextColor";

/**
 * Color swatch row = HER categories (this planner's, deduped) + black + the
 * last custom pick. Used by the text-block menu and the ⬚ selection recolor
 * bar so both offer the identical palette.
 */
export function useColorSwatches(plannerId: string): {
  swatches: { color: string; name: string }[];
  rememberCustom: (color: string) => void;
} {
  const categories =
    useLiveQuery(
      () => db.categories.where("plannerId").equals(plannerId).sortBy("order"),
      [plannerId]
    ) ?? [];
  const [lastCustom, setLastCustom] = useState<string | null>(() =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(LAST_CUSTOM_KEY)
  );
  const seen = new Set<string>();
  const swatches: { color: string; name: string }[] = [];
  for (const c of categories) {
    const key = c.color.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    swatches.push({ color: c.color, name: c.name });
  }
  if (!seen.has("#000000")) swatches.push({ color: "#000000", name: "Black" });
  if (lastCustom && !seen.has(lastCustom.toLowerCase()) && lastCustom.toLowerCase() !== "#000000") {
    swatches.push({ color: lastCustom, name: "Custom" });
  }
  return {
    swatches,
    rememberCustom: (color: string) => {
      localStorage.setItem(LAST_CUSTOM_KEY, color);
      setLastCustom(color);
    },
  };
}
