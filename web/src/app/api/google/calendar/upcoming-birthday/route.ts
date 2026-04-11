import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { todayString, USER_TZ } from "@/lib/timezone";

export interface UpcomingBirthday {
  name: string;
  date: string;       // YYYY-MM-DD
  daysUntil: number;
}

function tzOffsetString(tz: string): string {
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const diffMins = Math.round((local.getTime() - utc.getTime()) / 60_000);
  const sign = diffMins >= 0 ? "+" : "-";
  const abs = Math.abs(diffMins);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

function isBirthdayEvent(title: string, calName: string): boolean {
  return /'s birthday$/i.test(title) || calName.toLowerCase().includes("birthday");
}

function personName(title: string): string {
  return title.replace(/'s birthday$/i, "").trim();
}

/** Parse YYYY-MM-DD or ISO dateTime, return just the date portion as YYYY-MM-DD. */
function parseEventDate(event: { start?: { date?: string | null; dateTime?: string | null } }): string | null {
  const d = event.start?.date ?? event.start?.dateTime;
  if (!d) return null;
  return d.slice(0, 10);
}

export async function GET() {
  try {
    const auth = getGoogleAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const today = todayString();
    const offset = tzOffsetString(USER_TZ);
    const timeMin = `${today}T00:00:00${offset}`;

    const lookaheadDate = new Date(Date.now() + 60 * 86_400_000);
    const lookaheadStr = new Intl.DateTimeFormat("en-CA", { timeZone: USER_TZ }).format(lookaheadDate);
    const timeMax = `${lookaheadStr}T23:59:59${offset}`;

    const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
    const calendars = calListRes.data.items ?? [];

    const candidates: UpcomingBirthday[] = [];

    await Promise.all(
      calendars.map(async (cal) => {
        const calName = cal.summaryOverride ?? cal.summary ?? cal.id ?? "Unknown";
        try {
          const res = await calendar.events.list({
            calendarId: cal.id!,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 50,
          });
          for (const e of res.data.items ?? []) {
            if (e.status === "cancelled") continue;
            const title = e.summary ?? "";
            if (!isBirthdayEvent(title, calName)) continue;
            const dateStr = parseEventDate(e);
            if (!dateStr) continue;
            const daysUntil = Math.round(
              (new Date(dateStr).getTime() - new Date(today).getTime()) / 86_400_000
            );
            candidates.push({ name: personName(title), date: dateStr, daysUntil });
          }
        } catch {
          // non-accessible calendar — skip
        }
      })
    );

    if (candidates.length === 0) {
      return NextResponse.json({ birthday: null });
    }

    // Sort by daysUntil ascending, pick nearest
    candidates.sort((a, b) => a.daysUntil - b.daysUntil);
    return NextResponse.json({ birthday: candidates[0] });
  } catch (err) {
    console.error("[upcoming-birthday] error:", err);
    return NextResponse.json({ birthday: null, error: "Failed to fetch birthday" });
  }
}
