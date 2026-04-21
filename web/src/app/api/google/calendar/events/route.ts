import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthClient, GoogleNotConnectedError } from "@/lib/google-auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({ eventId: `demo-${Date.now()}`, note: "Demo mode — not saved." });
  }

  const body = await req.json() as {
    title: string;
    date: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    description?: string;
    all_day?: boolean;
  };

  if (!body.title || !body.date) {
    return NextResponse.json({ error: "title and date are required" }, { status: 400 });
  }

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const calendar = google.calendar({ version: "v3", auth });
    const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eventBody: Record<string, any>;
    if (body.all_day) {
      eventBody = {
        summary: body.title,
        start: { date: body.date },
        end: { date: body.date },
        ...(body.location ? { location: body.location } : {}),
        ...(body.description ? { description: body.description } : {}),
      };
    } else {
      const startTime = body.start_time ?? "09:00";
      const [h, m] = startTime.split(":").map(Number);
      const endTime = body.end_time ?? `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      eventBody = {
        summary: body.title,
        start: { dateTime: `${body.date}T${startTime}:00`, timeZone: tz },
        end: { dateTime: `${body.date}T${endTime}:00`, timeZone: tz },
        ...(body.location ? { location: body.location } : {}),
        ...(body.description ? { description: body.description } : {}),
      };
    }

    const res = await calendar.events.insert({ calendarId: "primary", requestBody: eventBody });
    return NextResponse.json({ eventId: res.data.id, title: res.data.summary, start: res.data.start, end: res.data.end });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 403 });
    }
    console.error("[calendar/events POST] error:", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
