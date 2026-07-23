import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import { PLANNER_NAME } from "@/lib/branding";

export const metadata: Metadata = {
  title: PLANNER_NAME,
  description: "Pen-first, continuously-scrolling digital planner",
  appleWebApp: { capable: true, title: PLANNER_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b8d8f5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
