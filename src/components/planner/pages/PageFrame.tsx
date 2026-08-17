"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * TASKS / CLEANING style label — bold text on a soft gradient blob. The blob
 * always hugs the text; when a long custom page title would overflow the
 * page, the font shrinks until the chip fits (Jo: chip resizes to the text).
 */
export function LabelPill({
  text,
  onRename,
  placeholder = "Page title",
}: {
  text: string;
  /** Supply to make the pill tap-to-edit (section + added pages, Jo r12). */
  onRename?: (title: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const shown = editing ? draft : text;
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const fit = () => {
      const maxW = parent.clientWidth * 0.95;
      // measure at natural size: scrollWidth of the unscaled chip
      const natural = el.scrollWidth / (Number(el.dataset.scale) || 1);
      const next = natural > maxW ? Math.max(0.45, maxW / natural) : 1;
      el.dataset.scale = String(next);
      setScale(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
    // re-fit as she types, so the chip grows/shrinks with the text (Jo r12)
  }, [shown]);

  const commit = () => {
    setEditing(false);
    const clean = draft.trim();
    if (clean && clean !== text) onRename?.(clean);
    else setDraft(text);
  };

  return (
    <span
      ref={ref}
      data-label-pill={text}
      onDoubleClick={() => {
        if (!onRename || editing) return;
        setDraft(text);
        setEditing(true);
      }}
      className={`inline-block self-start whitespace-nowrap rounded-full px-[1.2cqw] py-[0.2cqw] font-bold tracking-wide text-black ${
        onRename && !editing ? "cursor-text" : ""
      }`}
      style={{
        fontSize: `calc(1.9cqw * ${scale})`,
        background:
          "radial-gradient(ellipse at 30% 50%, rgba(160,235,190,0.9), rgba(120,160,245,0.75) 75%)",
      }}
      title={onRename && !editing ? "Double-tap to rename this page" : undefined}
    >
      {editing ? (
        <input
          autoFocus
          data-label-pill-input
          value={draft}
          placeholder={placeholder}
          // size follows the text so the chip behind it hugs what she types
          size={Math.max(4, shown.length || placeholder.length)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(text);
              setEditing(false);
            }
          }}
          className="w-auto border-0 bg-transparent p-0 font-bold tracking-wide text-black outline-none"
          style={{ fontSize: "inherit" }}
        />
      ) : (
        text || placeholder
      )}
    </span>
  );
}
