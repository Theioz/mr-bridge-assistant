import { google } from "googleapis";
import { NextResponse } from "next/server";
import { startOfTodayRFC3339, endOfTodayRFC3339 } from "@/lib/timezone";
import { getGoogleAuthClient } from "@/lib/google-auth";

export interface CalendarEvent {
  time: string;
  title: string;
  location?: string;
}

function formatTime(dateTimeStr: string | null | undefined, dateStr: string | null | undefined): string {
  if (!dateTimeStr && dateStr) return "All day";
  if (!dateTimeStr) return "";
  const d = new Date(dateTimeStr);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function GET() {
  try {
    const auth = getGoogleAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = startOfTodayRFC3339();
    const timeMax = endOfTodayRFC3339();

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 10,
    });

    const items = res.data.items ?? [];

    const events: CalendarEvent[] = items
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        time: formatTime(e.start?.dateTime, e.start?.date),
        title: e.summary ?? "(No title)",
        ...(e.location ? { location: e.location } : {}),
      }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[calendar] error:", err);
    return NextResponse.json({ events: [], error: "Failed to fetch calendar" });
  }
}
