# Protecting Jo's data — owner's checklist

Jo's planner data (ink, notes, images, habits) lives in **Edge's IndexedDB on
her Surface**, keyed to the app's exact URL. Vercel only serves code. That
means:

## Always safe

- Pushing updates / Vercel redeploys — never touch her device data.
- Windows updates, Edge updates, restarting or reinstalling the PWA window.
- Deleting and re-adding the taskbar pin.

## The rules that keep her data alive

1. **Never change the URL.** Data is bound to the origin
   (`https://your-project.vercel.app`). Renaming the Vercel project or moving
   to a custom domain makes the app start empty at the new address. Pick the
   final URL before she starts using it. If a domain change ever becomes
   necessary: **Download backup at the old URL → Restore at the new one** (⚙ →
   Backup).
2. **Keep the Vercel project alive.** If it's deleted, her data is still on
   the Surface, but the app won't load until the SAME domain serves it again.
3. **On the Surface, never:**
   - clear Edge's browsing data with *"Cookies and other site data"* checked;
   - run disk-cleanup tools that clear browser storage (CCleaner and similar);
   - tick **"Also clear data from Microsoft Edge"** when uninstalling the app;
   - remove/reset her Edge profile;
   - use the planner in an InPrivate window (that storage is wiped on close).
4. **Backups (the real safety net):** ⚙ → **Download backup** produces one
   .json file containing everything, restorable on any device via **Restore
   from file** (restore merges — it never deletes newer work). Suggest a
   monthly habit, saved to OneDrive. The ⬇ Year PDF is a nice human-readable
   copy but is NOT restorable — the .json is the real backup.
5. **New device / Windows reset:** install the app at the same URL, ⚙ →
   Restore from file with the latest backup.

## What the app itself now does to protect data

- Requests **persistent storage** on every launch
  (`navigator.storage.persist()`), so Edge won't silently evict the planner
  under disk pressure — auto-granted for installed PWAs; the ⚙ Backup section
  shows the protection status.
- Restore is **merge-by-id**: importing an old backup can only add missing
  rows, never erase newer ones.
- All future schema changes must use additive Dexie versioning (existing
  stores are never dropped) — this is a standing rule for anyone touching
  `src/lib/db/db.ts`.

## The eventual upgrade

Real Supabase sync (schema + RLS already shipped, module currently stubbed)
would turn all of this into automatic continuous cloud backup tied to her
account instead of her device. Until then: the monthly backup file is the
discipline that matters.
