import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Jo's Planner",
  description: "Pen-first, continuously-scrolling digital planner",
  appleWebApp: { capable: true, title: "Jo's Planner", statusBarStyle: "default" },
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
