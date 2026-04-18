import { tool, jsonSchema } from "ai";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { todayString, addDays, startOfDayRFC3339, endOfDayRFC3339 } from "@/lib/timezone";
import { ok, err } from "./_contract";
import { STRICT_TOOLS } from "./_strict";
import type { ToolContext } from "./_context";

const DEMO_CALENDAR_EVENTS = [
  { title: "Morning run", start: `${todayString()}T06:30:00`, end: `${todayString()}T07:15:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: null },
  { title: "Team standup", start: `${todayString()}T09:00:00`, end: `${todayString()}T09:30:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Google Meet" },
  { title: "Lunch w/ Priya", start: `${todayString()}T12:30:00`, end: `${todayString()}T13:30:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Tartine Manufactory" },
  { title: "Gym — push day", start: `${todayString()}T18:00:00`, end: `${todayString()}T19:00:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Equinox SoMa" },
];

export function buildCalendarTools({ isDemo }: ToolContext) {
  return {
    list_calendar_events: tool({
      description:
        "List events across all Google Calendars for a given date range. Defaults to today only. Use this whenever the user asks what's on their calendar, schedule, or agenda. Each event in the result includes an eventId field — preserve and use it when calling delete_calendar_event or update_calendar_event.",
      inputSchema: jsonSchema<{ date?: string; days?: number }>({
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Start date in YYYY-MM-DD format. Defaults to today.",
          },
          days: {
            type: "number",
            description: "Number of days to include (1 = just the start date). Defaults to 1.",
          },
        },
      }),
      execute: async ({ date, days = 1 }) => {
        if (isDemo) {
          return { events: DEMO_CALENDAR_EVENTS, count: DEMO_CALENDAR_EVENTS.length };
        }
        try {
          const startDate = date ?? todayString();
          const endDate = addDays(startDate, Math.max(1, days) - 1);

          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });

          const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
          const calendars = calListRes.data.items ?? [];

          const allEventArrays = await Promise.all(
            calendars.map(async (cal) => {
              const res = await calendar.events.list({
                calendarId: cal.id!,
                timeMin: startOfDayRFC3339(startDate),
                timeMax: endOfDayRFC3339(endDate),
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 25,
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
                .map((e) => ({
                  eventId: e.id ?? "",
                  title: e.summary ?? "(No title)",
                  start: e.start?.dateTime ?? e.start?.date ?? "",
                  end: e.end?.dateTime ?? e.end?.date ?? "",
                  allDay: !e.start?.dateTime,
                  calendar: calName,
                  calendarType,
                  location: e.location ?? null,
                }));
            })
          );

          const events = allEventArrays
            .flat()
            .sort((a, b) => a.start.localeCompare(b.start));

          return { events, count: events.length };
        } catch (caughtErr) {
          return { error: caughtErr instanceof Error ? caughtErr.message : "Failed to list calendar events" };
        }
      },
    }),

    create_calendar_event: tool({
      description:
        "Create a new event on the primary Google Calendar. For timed events, provide date + start_time. For all-day events, set all_day: true and provide only date.",
      inputSchema: jsonSchema<{
        title: string;
        date: string;
        start_time?: string;
        end_time?: string;
        location?: string;
        description?: string;
        all_day?: boolean;
      }>({
        type: "object",
        required: ["title", "date"],
        properties: {
          title: { type: "string", description: "Event title/summary." },
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          start_time: {
            type: "string",
            description: "Start time in HH:MM (24h) format. Required for timed events.",
          },
          end_time: {
            type: "string",
            description: "End time in HH:MM (24h) format. Defaults to start_time + 2 hours.",
          },
          location: { type: "string", description: "Event location." },
          description: { type: "string", description: "Event description or notes." },
          all_day: {
            type: "boolean",
            description: "If true, creates an all-day event. start_time and end_time are ignored.",
          },
        },
      }),
      strict: STRICT_TOOLS.create_calendar_event,
      execute: async ({ title, date, start_time, end_time, location, description, all_day = false }) => {
        if (isDemo) {
          return ok({
            id: `demo-${Date.now()}`,
            title,
            start: { date, dateTime: start_time ? `${date}T${start_time}:00` : date },
            end: { date, dateTime: end_time ? `${date}T${end_time}:00` : date },
            note: "Demo mode — event not saved to real calendar.",
          });
        }
        try {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return err(`date must be YYYY-MM-DD, got: "${date}"`);
          }
          if (!all_day && !start_time) {
            return err("start_time is required for timed events. Use all_day: true for all-day events.");
          }

          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });
          const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let eventBody: Record<string, any>;

          if (all_day) {
            eventBody = {
              summary: title,
              start: { date },
              end: { date },
              ...(location ? { location } : {}),
              ...(description ? { description } : {}),
            };
          } else {
            let computedEnd = end_time;
            if (!computedEnd) {
              const [h, m] = start_time!.split(":").map(Number);
              computedEnd = `${String((h + 2) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            }
            eventBody = {
              summary: title,
              start: { dateTime: `${date}T${start_time}:00`, timeZone: tz },
              end: { dateTime: `${date}T${computedEnd}:00`, timeZone: tz },
              ...(location ? { location } : {}),
              ...(description ? { description } : {}),
            };
          }

          const res = await calendar.events.insert({
            calendarId: "primary",
            requestBody: eventBody,
          });
          if (!res.data.id) return err("Google returned no event id — create may not have persisted.");

          // Read-after-write verification (#319): confirm the event Google
          // actually stored matches what we asked for. Catches wrong-target /
          // partial-write / silent-rewrite classes that a 200 response can't.
          const verify = await calendar.events.get({ calendarId: "primary", eventId: res.data.id });
          const verifiedStart = verify.data.start?.dateTime ?? verify.data.start?.date ?? null;
          const verifiedEnd = verify.data.end?.dateTime ?? verify.data.end?.date ?? null;
          const expectedStart = all_day ? date : `${date}T${start_time}:00`;
          if (!verifiedStart?.startsWith(expectedStart.slice(0, all_day ? 10 : 16))) {
            return err(
              `Calendar accepted the create but a follow-up read shows start=${verifiedStart}, expected to start with ${expectedStart}. The event may not be where you wanted it.`
            );
          }

          return ok({
            id: res.data.id,
            title: res.data.summary,
            start: res.data.start,
            end: res.data.end,
            link: res.data.htmlLink,
            verified: { start: verifiedStart, end: verifiedEnd },
          });
        } catch (caughtErr) {
          return err(caughtErr instanceof Error ? caughtErr.message : "Failed to create calendar event");
        }
      },
    }),

    delete_calendar_event: tool({
      description:
        "Delete a Google Calendar event by eventId. IMPORTANT: before calling this tool, always state the event title, date, and time to the user and require explicit confirmation. Never delete without confirmed user intent.",
      inputSchema: jsonSchema<{ eventId: string }>({
        type: "object",
        required: ["eventId"],
        properties: {
          eventId: { type: "string", description: "The eventId from list_calendar_events." },
        },
      }),
      execute: async ({ eventId }) => {
        if (isDemo) {
          return ok({ eventId, note: "Demo mode — event not deleted from real calendar." });
        }
        try {
          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });
          await calendar.events.delete({ calendarId: "primary", eventId });

          // Read-after-write verification (#319): confirm the event is gone or
          // marked cancelled. Google delete returns 204 even if the event was
          // already gone, so we re-read to be sure.
          try {
            const verify = await calendar.events.get({ calendarId: "primary", eventId });
            if (verify.data.status !== "cancelled") {
              return err(`Calendar accepted the delete but a follow-up read still shows status=${verify.data.status}. The event may not be deleted.`);
            }
          } catch (verifyErr) {
            // 404/410 on get-after-delete means the event is gone — that's success.
            const status = (verifyErr as { code?: number; response?: { status?: number } }).code
              ?? (verifyErr as { response?: { status?: number } }).response?.status;
            if (status !== 404 && status !== 410) {
              return err(
                `Calendar accepted the delete but verification failed: ${verifyErr instanceof Error ? verifyErr.message : "unknown error"}`
              );
            }
          }

          return ok({ eventId });
        } catch (caughtErr) {
          return err(caughtErr instanceof Error ? caughtErr.message : "Failed to delete calendar event");
        }
      },
    }),

    update_calendar_event: tool({
      description:
        "Update an existing Google Calendar event by eventId. Accepts any subset of: summary (title), start (RFC3339 dateTime or date), end (RFC3339 dateTime or date), location, description. IMPORTANT: before calling, state the before/after changes and require explicit user confirmation.",
      inputSchema: jsonSchema<{
        eventId: string;
        summary?: string;
        start?: string;
        end?: string;
        location?: string;
        description?: string;
      }>({
        type: "object",
        required: ["eventId"],
        properties: {
          eventId: { type: "string", description: "The eventId from list_calendar_events." },
          summary: { type: "string", description: "New event title." },
          start: { type: "string", description: "New start as RFC3339 dateTime (e.g. 2026-04-15T09:00:00) or date (YYYY-MM-DD) for all-day." },
          end: { type: "string", description: "New end as RFC3339 dateTime or date." },
          location: { type: "string", description: "New location string." },
          description: { type: "string", description: "New description/notes." },
        },
      }),
      strict: STRICT_TOOLS.update_calendar_event,
      execute: async ({ eventId, summary, start, end, location, description }) => {
        if (isDemo) {
          return ok({ eventId, note: "Demo mode — event not updated in real calendar." });
        }
        try {
          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });
          const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

          // Build patch body — only include fields that were provided
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const requestBody: Record<string, any> = {};
          if (summary !== undefined) requestBody.summary = summary;
          if (location !== undefined) requestBody.location = location;
          if (description !== undefined) requestBody.description = description;
          if (start !== undefined) {
            requestBody.start = /T/.test(start)
              ? { dateTime: start.length === 16 ? `${start}:00` : start, timeZone: tz }
              : { date: start };
          }
          if (end !== undefined) {
            requestBody.end = /T/.test(end)
              ? { dateTime: end.length === 16 ? `${end}:00` : end, timeZone: tz }
              : { date: end };
          }

          const res = await calendar.events.patch({
            calendarId: "primary",
            eventId,
            requestBody,
          });

          // Read-after-write verification (#319): the original symptom of the
          // bug was a "successful" patch that didn't actually change the event.
          // Re-read and check the requested fields match what we asked for.
          const verify = await calendar.events.get({ calendarId: "primary", eventId });
          const mismatches: string[] = [];
          if (summary !== undefined && verify.data.summary !== summary) {
            mismatches.push(`summary expected "${summary}", got "${verify.data.summary}"`);
          }
          if (start !== undefined) {
            const verifiedStart = verify.data.start?.dateTime ?? verify.data.start?.date ?? "";
            const expectedPrefix = /T/.test(start) ? start.slice(0, 16) : start;
            if (!verifiedStart.startsWith(expectedPrefix)) {
              mismatches.push(`start expected to begin with "${expectedPrefix}", got "${verifiedStart}"`);
            }
          }
          if (end !== undefined) {
            const verifiedEnd = verify.data.end?.dateTime ?? verify.data.end?.date ?? "";
            const expectedPrefix = /T/.test(end) ? end.slice(0, 16) : end;
            if (!verifiedEnd.startsWith(expectedPrefix)) {
              mismatches.push(`end expected to begin with "${expectedPrefix}", got "${verifiedEnd}"`);
            }
          }
          if (location !== undefined && verify.data.location !== location) {
            mismatches.push(`location expected "${location}", got "${verify.data.location}"`);
          }
          if (mismatches.length > 0) {
            return err(`Calendar accepted the update but a follow-up read shows it didn't take: ${mismatches.join("; ")}`);
          }

          return ok({
            eventId: res.data.id,
            title: res.data.summary,
            start: res.data.start,
            end: res.data.end,
            link: res.data.htmlLink,
            verified: true,
          });
        } catch (caughtErr) {
          return err(caughtErr instanceof Error ? caughtErr.message : "Failed to update calendar event");
        }
      },
    }),
  };
}
