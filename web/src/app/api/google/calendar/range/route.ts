import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { startOfDayRFC3339, endOfDayRFC3339, todayString, addDays } from "@/lib/timezone";
import { getGoogleAuthClient, GoogleNotConnectedError } from "@/lib/google-auth";
import { getExcludedCalendarIds } from "@/lib/calendar/excluded";
import { createClient } from "@/lib/supabase/server";
import type { CalendarRangeEvent } from "@/lib/calendar-types";

// Extended demo fixtures spanning 3 weeks
function buildDemoEvents(): CalendarRangeEvent[] {
  const today = todayString();
  const d = (offset: number) => addDays(today, offset);
  return [
    // Today
    { eventId: "demo-1", title: "Morning run", start: `${d(0)}T06:30:00`, end: `${d(0)}T07:15:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: null },
    { eventId: "demo-2", title: "Team standup", start: `${d(0)}T09:00:00`, end: `${d(0)}T09:30:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Google Meet" },
    { eventId: "demo-3", title: "Lunch w/ Priya", start: `${d(0)}T12:30:00`, end: `${d(0)}T13:30:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Tartine Manufactory" },
    { eventId: "demo-4", title: "Gym — push day", start: `${d(0)}T18:00:00`, end: `${d(0)}T19:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Equinox SoMa" },
    // Yesterday
    { eventId: "demo-5", title: "Doctor appointment", start: `${d(-1)}T10:00:00`, end: `${d(-1)}T10:45:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "UCSF Medical Center" },
    { eventId: "demo-6", title: "Coffee w/ Marcus", start: `${d(-1)}T15:00:00`, end: `${d(-1)}T16:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Sightglass Coffee" },
    // Tomorrow
    { eventId: "demo-7", title: "Product review", start: `${d(1)}T10:00:00`, end: `${d(1)}T11:30:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Google Meet" },
    { eventId: "demo-8", title: "1:1 with Sarah", start: `${d(1)}T14:00:00`, end: `${d(1)}T14:30:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: null },
    // Day after tomorrow
    { eventId: "demo-9", title: "Design sync", start: `${d(2)}T11:00:00`, end: `${d(2)}T12:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Zoom" },
    { eventId: "demo-10", title: "Evening yoga", start: `${d(2)}T19:00:00`, end: `${d(2)}T20:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "CorePower Yoga" },
    // Next week
    { eventId: "demo-11", title: "Quarterly planning", start: `${d(7)}T09:00:00`, end: `${d(7)}T12:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Office — Mission St" },
    { eventId: "demo-12", title: "Flight to NYC", start: `${d(8)}T06:00:00`, end: `${d(8)}T14:30:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "SFO → JFK" },
    { eventId: "demo-13", title: "Conference day 1", start: `${d(9)}T09:00:00`, end: `${d(9)}T18:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Javits Center, NYC" },
    { eventId: "demo-14", title: "Conference day 2", start: `${d(10)}T09:00:00`, end: `${d(10)}T17:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Javits Center, NYC" },
    // All-day events
    { eventId: "demo-15", title: "Team offsite", start: d(3), end: d(5), allDay: true, calendarName: "Alex Chen", calendarType: "primary", location: null },
    { eventId: "demo-16", title: "Memorial Day", start: d(6), end: d(6), allDay: true, calendarName: "US Holidays", calendarType: "holiday", location: null },
    // Birthday
    { eventId: "demo-17", title: "Marcus's birthday", start: d(4), end: d(4), allDay: true, calendarName: "Contacts", calendarType: "birthday", location: null },
    // Last week
    { eventId: "demo-18", title: "Sprint retro", start: `${d(-5)}T14:00:00`, end: `${d(-5)}T15:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: "Google Meet" },
    { eventId: "demo-19", title: "Weekly review", start: `${d(-7)}T10:00:00`, end: `${d(-7)}T11:00:00`, allDay: false, calendarName: "Alex Chen", calendarType: "primary", location: null },
    // Overlapping events (same time slot, today)
    { eventId: "demo-20", title: "Async standup (Slack)", start: `${d(0)}T09:00:00`, end: `${d(0)}T09:15:00`, allDay: false, calendarName: "Work", calendarType: "other", location: null },
  ];
}

function parseDate(param: string | null, defaultDate: string): string {
  if (!param) return defaultDate;
  // Accept YYYY-MM-DD or ISO datetime
  return param.length === 10 ? param : param.slice(0, 10);
}

export async function GET(req: NextRequest) {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const today = todayString();
  const timeMinDate = parseDate(searchParams.get("timeMin"), today);
  const timeMaxDate = parseDate(searchParams.get("timeMax"), today);

  if (user.id === process.env.DEMO_USER_ID) {
    const allDemo = buildDemoEvents();
    const events = allDemo.filter(
      (e) => e.start.slice(0, 10) >= timeMinDate && e.start.slice(0, 10) <= timeMaxDate
    );
    return NextResponse.json({ events });
  }

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const calendar = google.calendar({ version: "v3", auth });

    const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
    const excluded = await getExcludedCalendarIds(serverClient, user.id);
    const calendars = (calListRes.data.items ?? []).filter(
      (c) => !excluded.has(c.id ?? ""),
    );

    const allEventArrays = await Promise.all(
      calendars.map(async (cal) => {
        const res = await calendar.events.list({
          calendarId: cal.id!,
          timeMin: startOfDayRFC3339(timeMinDate),
          timeMax: endOfDayRFC3339(timeMaxDate),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 100,
        });
        const calName = cal.summaryOverride ?? cal.summary ?? cal.id ?? "Unknown";
        const calNameLower = calName.toLowerCase();
        const calendarType = cal.primary
          ? "primary"
          : calNameLower.includes("birthday") || calNameLower.includes("contact")
          ? "birthday"
          : calNameLower.includes("holiday")
          ? "holiday"
          : "other";

        return (res.data.items ?? [])
          .filter((e) => {
            if (e.status === "cancelled") return false;
            const selfAttendee = e.attendees?.find((a) => a.self);
            if (selfAttendee?.responseStatus === "declined") return false;
            return true;
          })
          .map((e): CalendarRangeEvent => ({
            eventId: e.id ?? "",
            title: e.summary ?? "(No title)",
            start: e.start?.dateTime ?? e.start?.date ?? "",
            end: e.end?.dateTime ?? e.end?.date ?? "",
            allDay: !e.start?.dateTime,
            calendarName: calName,
            calendarType: calendarType as CalendarRangeEvent["calendarType"],
            location: e.location ?? null,
          }));
      })
    );

    const events = allEventArrays
      .flat()
      .sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ events: [], not_connected: true }, { status: 403 });
    }
    console.error("[calendar/range] error:", err);
    return NextResponse.json({ events: [], error: "Failed to fetch calendar events" });
  }
}

