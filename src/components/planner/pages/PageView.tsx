import type { Page } from "@/lib/db/types";
import WeekPage from "./WeekPage";
import MonthPage from "./MonthPage";
import YearPage from "./YearPage";
import SectionPage from "./SectionPage";
import BirthdaysPage from "./BirthdaysPage";

export default function PageView({ page }: { page: Page }) {
  switch (page.type) {
    case "week":
      return <WeekPage page={page} />;
    case "month":
      return <MonthPage page={page} />;
    case "year":
      return <YearPage page={page} />;
    case "section":
      return page.meta.sectionKey === "birthdays" ? (
        <BirthdaysPage page={page} />
      ) : (
        <SectionPage page={page} />
      );
  }
}
