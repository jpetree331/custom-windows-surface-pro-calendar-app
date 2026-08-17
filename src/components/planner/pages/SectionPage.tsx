"use client";

import type { Page } from "@/lib/db/types";
import { renamePage } from "@/lib/blocks/actions";
import PageFrame, { LabelPill } from "./PageFrame";

/** Freeform section page (TO DO, BUSINESS, NOTES, …) — label + open surface.
 *  The title is double-tap editable and the chip hugs whatever she types
 *  (Jo r12), which covers both the built-in back pages and added ones. */
export default function SectionPage({ page }: { page: Page }) {
  return (
    <PageFrame>
      <div className="absolute inset-[1.2cqw]">
        <LabelPill text={page.label} onRename={(title) => void renamePage(page.id, title)} />
      </div>
    </PageFrame>
  );
}
