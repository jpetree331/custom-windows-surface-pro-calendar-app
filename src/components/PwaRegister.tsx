"use client";

import { useEffect } from "react";
import { ensurePersistentStorage } from "@/lib/backup";
import { autoDriveBackup } from "@/lib/backup-auto";

/**
 * Boot-time protections: registers the service worker (installable +
 * offline), requests persistent storage so IndexedDB can't be auto-evicted,
 * and runs the silent Google Drive auto-backup on an interval and whenever
 * the app is hidden/closed.
 */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        void navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            // Pick up a new deploy without needing a full app relaunch: an
            // installed PWA that's only ever resumed kept running whatever
            // bundle it loaded first (Jo r12).
            // Reload into the new build at a SAFE moment: every text surface
            // in this app commits on blur, so an instant reload would discard
            // whatever Jo was mid-way through typing (r12 review). Wait until
            // nothing is being edited, or until she switches away.
            let pendingReload = false;
            const editingNow = () => {
              const el = document.activeElement as HTMLElement | null;
              return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA"].includes(el.tagName));
            };
            const reloadWhenSafe = () => {
              if (!pendingReload) return;
              if (document.visibilityState === "hidden" || !editingNow()) window.location.reload();
            };
            reg.addEventListener("updatefound", () => {
              const fresh = reg.installing;
              fresh?.addEventListener("statechange", () => {
                if (fresh.state === "installed" && navigator.serviceWorker.controller) {
                  pendingReload = true;
                  reloadWhenSafe();
                }
              });
            });
            document.addEventListener("focusout", () => setTimeout(reloadWhenSafe, 250));
            // check on resume, not just on first load; and if an update is
            // already waiting, going away is the safest time to apply it
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "visible") void reg.update();
              else reloadWhenSafe();
            });
          })
          .catch((err) => {
            console.warn("Service worker registration failed:", err);
          });
      } else {
        // Dev: the SW's cache-first _next/static strategy serves STALE chunks
        // (dev chunks aren't content-hashed). Unregister + purge so dev
        // machines always run the code on disk.
        void navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())));
        void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      }
    }
    void ensurePersistentStorage().then((granted) => {
      if (!granted) console.warn("Persistent storage not granted — data may be evicted under disk pressure.");
    });

    const tick = () => void autoDriveBackup();
    const onHide = () => {
      if (document.visibilityState === "hidden") tick();
    };
    const iv = setInterval(tick, 5 * 60_000);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
  return null;
}
