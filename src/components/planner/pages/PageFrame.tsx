import type { ReactNode } from "react";
import { PAGE_W, PAGE_H } from "@/lib/planner/constants";

/**
 * Shared page chrome: the mint→sky gradient sheet with the planner's aspect
 * ratio. `container-type: inline-size` lets templates size text in cqw so the
 * layout scales with page width (1cqw = 10 logical units of PAGE_W=1000).
 */
export default function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-md shadow-md"
      style={{
        aspectRatio: `${PAGE_W} / ${PAGE_H}`,
        containerType: "inline-size",
        background:
          "linear-gradient(90deg, #d9f5dc 0%, #cdeef2 45%, #a9c6f7 100%)",
      }}
    >
      {children}
    </div>
  );
}

/** TASKS / CLEANING style label — bold text on a soft gradient blob. */
export function LabelPill({ text }: { text: string }) {
  return (
    <span
      className="inline-block self-start rounded-full px-[1.2cqw] py-[0.2cqw] font-bold tracking-wide text-black"
      style={{
        fontSize: "1.9cqw",
        background:
          "radial-gradient(ellipse at 30% 50%, rgba(160,235,190,0.9), rgba(120,160,245,0.75) 75%)",
      }}
    >
      {text}
    </span>
  );
}
