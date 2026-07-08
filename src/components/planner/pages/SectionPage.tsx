import type { Page } from "@/lib/db/types";
import PageFrame, { LabelPill } from "./PageFrame";

/** Freeform section page (TO DO, BUSINESS, NOTES, …) — label + open surface. */
export default function SectionPage({ page }: { page: Page }) {
  return (
    <PageFrame>
      <div className="absolute inset-[1.2cqw]">
        <LabelPill text={page.label} />
      </div>
    </PageFrame>
  );
}
