import type { Metadata } from "next";
import CalendarView from "@/components/calendar/calendar-view";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Manage your Google Calendar — week, day, and month views.",
};

export default function CalendarPage() {
  return (
    /*
     * The protected layout adds px + pt-8 + pb-8 (desktop) / pb-24 (mobile).
     * We escape that padding to let the calendar fill the viewport:
     * -mx-5 lg:-mx-8 counteracts the main's horizontal padding.
     * height: calc(100dvh - ...) accounts for top padding only; the calendar
     * scroll container handles its own overflow.
     */
    <div
      className="-mx-5 lg:-mx-8"
      style={{
        height: "calc(100dvh - 5rem)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <CalendarView />
    </div>
  );
}
