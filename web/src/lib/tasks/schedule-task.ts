import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "@/lib/google-auth";

// Task ↔ Google Calendar, copying the workout_plans pattern (web/src/lib/tools/workouts.ts):
// the app row owns a single `calendar_event_id`; scheduled_start/end record the block so the UI
// and re-patch don't need a round-trip. Both operations are PARTIAL-SUCCESS: the schedule is
// persisted on the task first, then Google is attempted — a calendar failure is reported, never
// thrown, so the block is still recorded and the caller can tell the user sync failed (e.g. Google
// not connected) rather than losing the action.

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export interface ScheduleResult {
  ok: boolean;
  error?: string; // hard failure (task not found / not owned) — nothing was changed
  calendar_synced: boolean;
  calendar_error?: string; // soft failure — the block saved, the Google event did not
}

/** A task's calendar block: an all-day date, or a timed range (absolute UTC ISO instants). */
export type ScheduleBlock =
  | { allDay: true; date: string } // YYYY-MM-DD
  | { allDay: false; startISO: string; endISO: string };

/** Add one calendar day to a YYYY-MM-DD date — Google's all-day `end.date` is exclusive. */
function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Create or move the Google event for a task and record the block. */
export async function scheduleTask({
  supabase,
  userId,
  taskId,
  block,
}: {
  supabase: SupabaseClient;
  userId: string;
  taskId: string;
  block: ScheduleBlock;
}): Promise<ScheduleResult> {
  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, title, calendar_event_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message, calendar_synced: false };
  if (!task) return { ok: false, error: "Task not found.", calendar_synced: false };

  // Persist the block first, so the schedule survives even if Google is unreachable. All-day is
  // stored as noon-UTC of the date (never shifts across time zones), with a null end.
  const stored = block.allDay
    ? {
        scheduled_all_day: true,
        scheduled_start: `${block.date}T12:00:00.000Z`,
        scheduled_end: null,
      }
    : {
        scheduled_all_day: false,
        scheduled_start: block.startISO,
        scheduled_end: block.endISO,
      };
  const { error: saveErr } = await supabase
    .from("tasks")
    .update(stored)
    .eq("id", taskId)
    .eq("user_id", userId);
  if (saveErr) return { ok: false, error: saveErr.message, calendar_synced: false };

  try {
    const auth = await getGoogleAuthClient({ db: supabase, userId });
    const calendar = google.calendar({ version: "v3", auth });
    // Timed blocks carry a UTC offset (…Z), so Google places the event without a separate timeZone
    // field. All-day uses {date}; Google's end.date is exclusive, hence nextDay().
    const body = block.allDay
      ? {
          summary: task.title,
          start: { date: block.date },
          end: { date: nextDay(block.date) },
        }
      : {
          summary: task.title,
          start: { dateTime: block.startISO },
          end: { dateTime: block.endISO },
        };

    let eventId: string | null = task.calendar_event_id ?? null;
    if (eventId) {
      await withTimeout(
        calendar.events.patch({
          calendarId: "primary",
          eventId,
          requestBody: { ...body, status: "confirmed" },
        }),
        8000,
        "calendar patch",
      );
    } else {
      const res = await withTimeout(
        calendar.events.insert({ calendarId: "primary", requestBody: body }),
        8000,
        "calendar insert",
      );
      eventId = res.data.id ?? null;
      await supabase
        .from("tasks")
        .update({ calendar_event_id: eventId })
        .eq("id", taskId)
        .eq("user_id", userId);
    }
    return { ok: true, calendar_synced: true };
  } catch (calErr) {
    return {
      ok: true,
      calendar_synced: false,
      calendar_error: calErr instanceof Error ? calErr.message : "Calendar sync failed",
    };
  }
}

/** Remove a task's Google event and clear its block. */
export async function unscheduleTask({
  supabase,
  userId,
  taskId,
}: {
  supabase: SupabaseClient;
  userId: string;
  taskId: string;
}): Promise<ScheduleResult> {
  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, calendar_event_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message, calendar_synced: false };
  if (!task) return { ok: false, error: "Task not found.", calendar_synced: false };

  let calendarError: string | undefined;
  if (task.calendar_event_id) {
    try {
      const auth = await getGoogleAuthClient({ db: supabase, userId });
      const calendar = google.calendar({ version: "v3", auth });
      await withTimeout(
        calendar.events.delete({ calendarId: "primary", eventId: task.calendar_event_id }),
        8000,
        "calendar delete",
      );
    } catch (calErr) {
      // 404/410 = already gone = success. Anything else is a soft failure worth surfacing.
      const code =
        (calErr as { code?: number }).code ??
        (calErr as { response?: { status?: number } }).response?.status;
      if (code !== 404 && code !== 410) {
        calendarError = calErr instanceof Error ? calErr.message : "Calendar delete failed";
      }
    }
  }

  const { error: clearErr } = await supabase
    .from("tasks")
    .update({
      calendar_event_id: null,
      scheduled_start: null,
      scheduled_end: null,
      scheduled_all_day: false,
    })
    .eq("id", taskId)
    .eq("user_id", userId);
  if (clearErr) return { ok: false, error: clearErr.message, calendar_synced: false };

  return { ok: true, calendar_synced: !calendarError, calendar_error: calendarError };
}
