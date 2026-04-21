import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { ok, err, type OkResult, type ErrResult } from "@/lib/tools/_contract";

interface RescheduleResult {
  from_plan: Record<string, unknown>;
  to_plan: Record<string, unknown>;
  calendar_synced: boolean;
  calendar_error?: string;
}

export async function rescheduleWorkout({
  supabase,
  userId,
  from_date,
  to_date,
  reason,
}: {
  supabase: SupabaseClient;
  userId: string;
  from_date: string;
  to_date: string;
  reason?: string;
}): Promise<OkResult<RescheduleResult> | ErrResult> {
  if (from_date === to_date) return err("from_date and to_date must be different.");

  // Fetch source plan
  const { data: source, error: fetchErr } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("date", from_date)
    .single();
  if (fetchErr) return err(fetchErr.message);
  if (!source) return err(`No workout plan found for ${from_date}.`);
  if (source.status !== "planned") {
    return err(`Cannot reschedule a workout with status "${source.status}". Only 'planned' workouts can be rescheduled.`);
  }

  // Reject if a non-cancelled plan already exists at target date
  const { data: targetExisting } = await supabase
    .from("workout_plans")
    .select("id, status")
    .eq("user_id", userId)
    .eq("date", to_date)
    .single();
  if (targetExisting && targetExisting.status !== "cancelled") {
    return err(`A workout already exists for ${to_date} (status: ${targetExisting.status}). Cancel or reschedule it first.`);
  }

  // Insert new plan at target date (upsert handles the cancelled-row case)
  const { data: newPlan, error: insertErr } = await supabase
    .from("workout_plans")
    .upsert(
      {
        user_id: userId,
        date: to_date,
        name: source.name ?? null,
        warmup: source.warmup,
        workout: source.workout,
        cooldown: source.cooldown,
        notes: source.notes ?? null,
        status: "planned",
        cancel_reason: null,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();
  if (insertErr) return err(insertErr.message);
  if (!newPlan) return err("Reschedule insert returned no row — new plan may not have been saved.");

  // Soft-cancel the source row
  const cancelReason = reason ?? `rescheduled to ${to_date}`;
  const { data: cancelledSource, error: cancelErr } = await supabase
    .from("workout_plans")
    .update({
      status: "cancelled",
      cancel_reason: cancelReason,
      cancelled_at: new Date().toISOString(),
      calendar_event_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("date", from_date)
    .select()
    .single();
  if (cancelErr) return err(`New plan created but failed to cancel source: ${cancelErr.message}`);
  if (!cancelledSource || cancelledSource.status !== "cancelled") {
    return err(`New plan created but source cancel read-back failed — check ${from_date} manually.`);
  }

  // Move calendar event to new date if one exists
  const calEventId: string | null = source.calendar_event_id ?? null;
  if (!calEventId) {
    return ok({ from_plan: cancelledSource, to_plan: newPlan, calendar_synced: false });
  }

  const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

  try {
    const auth = await getGoogleAuthClient({ db: supabase, userId });
    const calendar = google.calendar({ version: "v3", auth });

    // PATCH the event to the new date — preserves event ID, attendees, and notifications.
    // Use all-day date format (matching assign_workout default) unless the
    // source event had a dateTime start, in which case use the same time on the new day.
    const existing = await calendar.events.get({ calendarId: "primary", eventId: calEventId });
    const sourceStart = existing.data.start;
    const sourceEnd = existing.data.end;

    let newStart: object;
    let newEnd: object;
    if (sourceStart?.dateTime) {
      const origTime = sourceStart.dateTime.slice(11, 16); // HH:MM
      const origEndTime = sourceEnd?.dateTime?.slice(11, 16) ?? origTime;
      newStart = { dateTime: `${to_date}T${origTime}:00`, timeZone: tz };
      newEnd = { dateTime: `${to_date}T${origEndTime}:00`, timeZone: tz };
    } else {
      newStart = { date: to_date };
      newEnd = { date: to_date };
    }

    const patchTitle = `Workout — ${new Date(to_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })}`;

    await calendar.events.patch({
      calendarId: "primary",
      eventId: calEventId,
      requestBody: { summary: patchTitle, start: newStart, end: newEnd },
    });

    // Read-after-write verify (#319)
    const verify = await calendar.events.get({ calendarId: "primary", eventId: calEventId });
    const verifiedStart = verify.data.start?.dateTime ?? verify.data.start?.date ?? "";
    if (!verifiedStart.startsWith(to_date)) {
      return ok({
        from_plan: cancelledSource,
        to_plan: newPlan,
        calendar_synced: false,
        calendar_error: `Calendar PATCH accepted but read-back shows start="${verifiedStart}", expected date ${to_date}.`,
      });
    }

    // Transfer calendar_event_id to the new plan row
    await supabase
      .from("workout_plans")
      .update({ calendar_event_id: calEventId })
      .eq("user_id", userId)
      .eq("date", to_date);
    newPlan.calendar_event_id = calEventId;

    return ok({ from_plan: cancelledSource, to_plan: newPlan, calendar_synced: true });
  } catch (calErr) {
    return ok({
      from_plan: cancelledSource,
      to_plan: newPlan,
      calendar_synced: false,
      calendar_error: calErr instanceof Error ? calErr.message : "Calendar reschedule failed",
    });
  }
}
