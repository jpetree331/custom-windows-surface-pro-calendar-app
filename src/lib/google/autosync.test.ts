import { describe, expect, it } from "vitest";
import { AUTO_SYNC_MS, autoSyncDue } from "./autosync";

describe("autoSyncDue (Tim's scheduled sync gate)", () => {
  const now = 1_700_000_000_000;

  it("never fires when off", () => {
    expect(autoSyncDue("off", null, now)).toBe(false);
    expect(autoSyncDue("off", now - AUTO_SYNC_MS["24h"] * 10, now)).toBe(false);
  });

  it("fires immediately when never synced", () => {
    expect(autoSyncDue("1h", null, now)).toBe(true);
    expect(autoSyncDue("24h", null, now)).toBe(true);
  });

  it("respects each interval boundary", () => {
    for (const interval of ["1h", "12h", "24h"] as const) {
      const ms = AUTO_SYNC_MS[interval];
      expect(autoSyncDue(interval, now - ms + 1000, now)).toBe(false); // just under
      expect(autoSyncDue(interval, now - ms, now)).toBe(true); // exactly due
      expect(autoSyncDue(interval, now - ms * 2, now)).toBe(true); // overdue
    }
  });
});
