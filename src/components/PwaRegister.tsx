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
        navigator.serviceWorker.register("/sw.js").catch((err) => {
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
