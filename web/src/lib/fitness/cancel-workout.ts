import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { ok, err, type OkResult, type ErrResult } from "@/lib/tools/_contract";

interface CancelResult {
  plan: Record<string, unknown>;
  calendar_synced: boolean;
  calendar_error?: string;
}

export async function cancelWorkout({
  supabase,
  userId,
  date,
  reason,
}: {
  supabase: SupabaseClient;
  userId: string;
  date: string;
  reason?: string;
}): Promise<OkResult<CancelResult> | ErrResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .single();
  if (fetchErr) return err(fetchErr.message);
  if (!existing) return err(`No workout plan found for ${date}.`);
  if (existing.status === "cancelled") {
    return err(`Workout for ${date} is already cancelled.`);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("workout_plans")
    .update({
      status: "cancelled",
      cancel_reason: reason ?? null,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("date", date)
    .select()
    .single();
  if (updateErr) return err(updateErr.message);
  if (!updated) return err("Cancel update returned no row — status may not have changed.");

  // Read-after-write verify (#319)
  if (updated.status !== "cancelled") {
    return err(`Status read-back shows "${updated.status}" — cancel may not have persisted.`);
  }

  const calEventId: string | null = existing.calendar_event_id ?? null;
  if (!calEventId) {
    return ok({ plan: updated, calendar_synced: false });
  }

  try {
    const auth = await getGoogleAuthClient({ db: supabase, userId });
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.delete({ calendarId: "primary", eventId: calEventId });

    // Verify deletion — 404/410 on get means gone (success)
    let calendarSynced = true;
    try {
      const verify = await calendar.events.get({ calendarId: "primary", eventId: calEventId });
      if (verify.data.status !== "cancelled") {
        calendarSynced = false;
      }
    } catch (verifyErr) {
      const code =
        (verifyErr as { code?: number }).code ??
        (verifyErr as { response?: { status?: number } }).response?.status;
      if (code !== 404 && code !== 410) {
        return ok({
          plan: updated,
          calendar_synced: false,
          calendar_error: `Deletion verify failed: ${verifyErr instanceof Error ? verifyErr.message : "unknown"}`,
        });
      }
      // 404/410 = gone = success
    }

    if (calendarSynced) {
      // Clear the event id from the row now that the event is gone
      await supabase
        .from("workout_plans")
        .update({ calendar_event_id: null })
        .eq("user_id", userId)
        .eq("date", date);
      updated.calendar_event_id = null;
    }

    return ok({ plan: updated, calendar_synced: calendarSynced });
  } catch (calErr) {
    return ok({
      plan: updated,
      calendar_synced: false,
      calendar_error: calErr instanceof Error ? calErr.message : "Calendar delete failed",
    });
  }
}
