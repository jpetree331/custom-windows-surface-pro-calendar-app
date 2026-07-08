"use client";

import { useEffect } from "react";
import { ensurePersistentStorage } from "@/lib/backup";

/**
 * Registers the service worker (installable + offline) and asks the browser
 * for persistent storage so the planner's IndexedDB can't be auto-evicted
 * under disk pressure.
 */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    }
    void ensurePersistentStorage().then((granted) => {
      if (!granted) console.warn("Persistent storage not granted — data may be evicted under disk pressure.");
    });
  }, []);
  return null;
}
