import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { startOfDayRFC3339, endOfDayRFC3339, todayString, USER_TZ } from "@/lib/timezone";
import { getGoogleAuthClient, GoogleNotConnectedError } from "@/lib/google-auth";
import { getExcludedCalendarIds } from "@/lib/calendar/excluded";
import { createClient } from "@/lib/supabase/server";
import type { CalendarRangeEvent } from "@/lib/calendar-types";

function parseDate(param: string | null, defaultDate: string): string {
  if (!param) return defaultDate;
  // Accept YYYY-MM-DD or ISO datetime
  return param.length === 10 ? param : param.slice(0, 10);
}

export async function GET(req: NextRequest) {
  const serverClient = await createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const today = todayString();
  const timeMinDate = parseDate(searchParams.get("timeMin"), today);
  const timeMaxDate = parseDate(searchParams.get("timeMax"), today);

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const calendar = google.calendar({ version: "v3", auth });

    const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
    const excluded = await getExcludedCalendarIds(serverClient, user.id);
    const calendars = (calListRes.data.items ?? []).filter((c) => !excluded.has(c.id ?? ""));

    const allEventArrays = await Promise.all(
      calendars.map(async (cal) => {
        const res = await calendar.events.list({
          calendarId: cal.id!,
          timeMin: startOfDayRFC3339(timeMinDate),
          timeMax: endOfDayRFC3339(timeMaxDate),
          // Ask Google for the response in the USER'S timezone. Without this it answers in
          // each CALENDAR's own default zone — Jason's "Formula 1" and "Family" calendars are
          // UTC, so their events come back as bare-Z instants and `start.slice(0, 10)` buckets
          // an evening Pacific event onto the next day.
          timeZone: USER_TZ,
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
          .map(
            (e): CalendarRangeEvent => ({
              eventId: e.id ?? "",
              title: e.summary ?? "(No title)",
              start: e.start?.dateTime ?? e.start?.date ?? "",
              end: e.end?.dateTime ?? e.end?.date ?? "",
              allDay: !e.start?.dateTime,
              calendarName: calName,
              calendarType: calendarType as CalendarRangeEvent["calendarType"],
              location: e.location ?? null,
            }),
          );
      }),
    );

    const events = allEventArrays.flat().sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ events: [], not_connected: true }, { status: 403 });
    }
    console.error("[calendar/range] error:", err);
    return NextResponse.json({ events: [], error: "Failed to fetch calendar events" });
  }
}
