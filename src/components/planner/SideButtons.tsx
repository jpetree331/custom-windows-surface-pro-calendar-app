"use client";

import { SIDE_BUTTONS } from "@/lib/planner/constants";

/** Right-edge jump buttons: ✱ Current Week, T, B, H, N, 🎂 (Gate C legend). */
export default function SideButtons({ onJump }: { onJump: (target: string) => void }) {
  return (
    <div className="pointer-events-none absolute right-1 top-12 z-20 flex flex-col gap-1.5">
      {SIDE_BUTTONS.map((b) => (
        <button
          key={b.key}
          data-side-button={b.key}
          title={b.title}
          onClick={() => onJump(b.target)}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md border border-white/60 text-lg font-extrabold text-black shadow-md active:scale-95"
          style={{ background: b.bg }}
        >
          {b.glyph}
        </button>
      ))}
    </div>
  );
}
