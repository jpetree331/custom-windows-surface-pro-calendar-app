import type { MetadataRoute } from "next";
import { PLANNER_NAME } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PLANNER_NAME,
    short_name: PLANNER_NAME,
    description: "Pen-first, continuously-scrolling digital planner",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#d9f5dc",
    theme_color: "#b8d8f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
