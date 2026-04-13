import { google } from "googleapis";
import { NextResponse } from "next/server";
import { startOfTodayRFC3339, endOfTodayRFC3339, USER_TZ } from "@/lib/timezone";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { createClient } from "@/lib/supabase/server";

export interface CalendarEvent {
  time: string;
  title: string;
  location?: string;
  calendarName: string;
  isPrimary: boolean;
  isBirthday: boolean;
}

function formatTime(dateTimeStr: string | null | undefined, dateStr: string | null | undefined): string {
  if (!dateTimeStr && dateStr) return "All day";
  if (!dateTimeStr) return "";
  const d = new Date(dateTimeStr);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: USER_TZ,
  });
}

const today = new Date().toISOString().slice(0, 10);
const DEMO_EVENTS: CalendarEvent[] = [
  { time: "6:30 AM",  title: "Morning run",    calendarName: "Alex Chen", isPrimary: true, isBirthday: false },
  { time: "9:00 AM",  title: "Team standup",   calendarName: "Alex Chen", isPrimary: true, isBirthday: false, location: "Google Meet" },
  { time: "12:30 PM", title: "Lunch w/ Priya", calendarName: "Alex Chen", isPrimary: true, isBirthday: false, location: "Tartine Manufactory" },
  { time: "6:00 PM",  title: "Gym — push day", calendarName: "Alex Chen", isPrimary: true, isBirthday: false, location: "Equinox SoMa" },
];
// suppress unused variable warning from linter
void today;

export async function GET() {
  // Return mock data for demo user
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (user?.id && user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({ events: DEMO_EVENTS });
  }

  try {
    const auth = getGoogleAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = startOfTodayRFC3339();
    const timeMax = endOfTodayRFC3339();

    // List all calendars so events from shared/secondary accounts are included
    const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
    const calendars = calListRes.data.items ?? [];

    const allEventArrays = await Promise.all(
      calendars.map(async (cal) => {
        const res = await calendar.events.list({
          calendarId: cal.id!,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 10,
        });
        const calName = cal.summaryOverride ?? cal.summary ?? cal.id ?? "Unknown";
        const isPrimary = cal.primary === true;
        return (res.data.items ?? [])
          .filter((e) => e.status !== "cancelled")
          .map((e) => {
            const title = e.summary ?? "(No title)";
            const isBirthday =
              /'s birthday$/i.test(title) ||
              calName.toLowerCase().includes("birthday");
            return {
              time: formatTime(e.start?.dateTime, e.start?.date),
              title,
              calendarName: calName,
              isPrimary,
              isBirthday,
              startDateTime: e.start?.dateTime ?? e.start?.date ?? "",
              ...(e.location ? { location: e.location } : {}),
            };
          });
      })
    );

    const events: CalendarEvent[] = allEventArrays
      .flat()
      .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
      .map(({ startDateTime: _dt, ...rest }) => rest);

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[calendar] error:", err);
    return NextResponse.json({ events: [], error: "Failed to fetch calendar" });
  }
}
