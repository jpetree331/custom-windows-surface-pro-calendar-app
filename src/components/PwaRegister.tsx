"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable and works offline. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    }
  }, []);
  return null;
}
