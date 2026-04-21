import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthClient, GoogleNotConnectedError } from "@/lib/google-auth";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ eventId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({ eventId, note: "Demo mode — not deleted." });
  }

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: "primary", eventId });
    return NextResponse.json({ eventId });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 403 });
    }
    console.error("[calendar/events DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.id === process.env.DEMO_USER_ID) {
    return NextResponse.json({ eventId, note: "Demo mode — not updated." });
  }

  const body = await req.json() as {
    title?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    description?: string;
    all_day?: boolean;
  };

  try {
    const auth = await getGoogleAuthClient({ db: serverClient, userId: user.id });
    const calendar = google.calendar({ version: "v3", auth });
    const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody: Record<string, any> = {};
    if (body.title !== undefined) requestBody.summary = body.title;
    if (body.location !== undefined) requestBody.location = body.location;
    if (body.description !== undefined) requestBody.description = body.description;

    if (body.date !== undefined) {
      if (body.all_day) {
        requestBody.start = { date: body.date };
        requestBody.end = { date: body.date };
      } else if (body.start_time) {
        const [h, m] = body.start_time.split(":").map(Number);
        const endTime = body.end_time ?? `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        requestBody.start = { dateTime: `${body.date}T${body.start_time}:00`, timeZone: tz };
        requestBody.end = { dateTime: `${body.date}T${endTime}:00`, timeZone: tz };
      }
    }

    const res = await calendar.events.patch({ calendarId: "primary", eventId, requestBody });
    return NextResponse.json({ eventId: res.data.id, title: res.data.summary, start: res.data.start, end: res.data.end });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 403 });
    }
    console.error("[calendar/events PATCH] error:", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
