import { google } from "googleapis";
import { NextResponse } from "next/server";

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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ events: [] });
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

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
