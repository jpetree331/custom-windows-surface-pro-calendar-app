/** Layout Options — mirrors Jo's Drawboard settings. */

export type PageLayout = "single" | "continuous";
export type PageView = "fit-page" | "fit-width" | "fit-height";

export interface ViewSettings {
  layout: PageLayout;
  view: PageView;
  /** 1 = fit exactly; range 0.5–3. The app zoom keeps the toolbar on screen. */
  zoom: number;
}

/** Jo's defaults: Single Page + Fit to Page. */
export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  layout: "single",
  view: "fit-page",
  zoom: 1,
};

const KEY = "jotter.viewSettings";

export function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VIEW_SETTINGS;
    const v = JSON.parse(raw) as Partial<ViewSettings>;
    return {
      layout: v.layout === "continuous" ? "continuous" : "single",
      view: v.view === "fit-width" || v.view === "fit-height" ? v.view : "fit-page",
      zoom: typeof v.zoom === "number" ? Math.min(3, Math.max(0.5, v.zoom)) : 1,
    };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function saveViewSettings(s: ViewSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Page width in CSS px for a feed area of w×h, honoring view mode + zoom. */
export function pageWidthFor(s: ViewSettings, w: number, h: number, aspect: number): number {
  const base =
    s.view === "fit-width" ? w : s.view === "fit-height" ? h * aspect : Math.min(w, h * aspect);
  return Math.max(120, Math.round(base * s.zoom));
}
