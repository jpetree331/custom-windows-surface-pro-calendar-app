/**
 * Per-deployment branding. One repo serves any number of planners: each
 * Vercel project sets NEXT_PUBLIC_PLANNER_NAME (e.g. "Tim's Planner") and
 * gets its own app title, PWA identity, planner title, and file names.
 * Defaults to Jo's.
 */
export const PLANNER_NAME = process.env.NEXT_PUBLIC_PLANNER_NAME || "Jo's Planner";

/** "Tim's Planner" → "tims-planner" (for PDF/backup filenames). */
export const PLANNER_SLUG = PLANNER_NAME
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
