import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "./log";

const FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const FITBIT_API_BASE = "https://api.fitbit.com";
const SYNC_DAYS = 7;

// ---------------------------------------------------------------------------
// OAuth token refresh — saves new token back to profile table (it rotates)
// ---------------------------------------------------------------------------

async function refreshFitbitToken(
  db: SupabaseClient,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fitbit token refresh failed ${res.status}: ${body}`);
  }

  const data = await res.json();

  // Save rotated refresh token back to profile table
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await db
      .from("profile")
      .upsert({ key: "fitbit_refresh_token", value: data.refresh_token }, { onConflict: "key" });
  }

  return data.access_token as string;
}

// ---------------------------------------------------------------------------
// Fitbit API fetch
// ---------------------------------------------------------------------------

async function fitbitGet(
  accessToken: string,
  path: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${FITBIT_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fitbit ${path} returned ${res.status}: ${body}`);
  }
  return res.json();
}

function fmtHrZones(zones: Record<string, unknown>[]): string | null {
  if (!zones?.length) return null;
  const order = ["Peak", "Cardio", "Fat Burn"];
  const zoneMap: Record<string, number> = {};
  for (const z of zones) zoneMap[z.name as string] = (z.minutes as number) ?? 0;
  const parts = order.filter((n) => (zoneMap[n] ?? 0) > 0).map((n) => `${n}: ${zoneMap[n]}m`);
  return parts.length ? parts.join(" | ") : null;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export interface FitbitSyncResult {
  bodyWritten: number;
  workoutsWritten: number;
}

export async function syncFitbit(db: SupabaseClient): Promise<FitbitSyncResult> {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET not configured");
  }

  // Read refresh token from profile table (it rotates, so env var won't work long-term)
  const { data: tokenRow } = await db
    .from("profile")
    .select("value")
    .eq("key", "fitbit_refresh_token")
    .maybeSingle();

  const refreshToken = tokenRow?.value as string | undefined;
  if (!refreshToken) throw new Error("fitbit_refresh_token not found in profile table");

  const accessToken = await refreshFitbitToken(db, clientId, clientSecret, refreshToken);

  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - SYNC_DAYS);
  const startStr = past.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  // Fetch body comp and workouts in parallel
  const weightUnit = (process.env.FITBIT_WEIGHT_UNIT ?? "lbs").toLowerCase();
  const isLbs = weightUnit === "lbs";

  const [weightData, workoutData] = await Promise.all([
    fitbitGet(accessToken, `/1/user/-/body/log/weight/date/${startStr}/${endStr}.json`),
    fitbitGet(
      accessToken,
      `/1/user/-/activities/list.json?afterDate=${startStr}&sort=asc&limit=100&offset=0`,
    ),
  ]);

  // ── Body composition ──────────────────────────────────────────────────────

  const bodyRows: Record<string, unknown>[] = [];
  for (const entry of (weightData.weight as Record<string, unknown>[] | undefined) ?? []) {
    const dt = entry.date as string | undefined;
    const weightVal = entry.weight as number | undefined;
    if (!dt || weightVal == null) continue;

    const row: Record<string, unknown> = {
      date: dt,
      weight_lb: Math.round((isLbs ? weightVal : weightVal * 2.20462) * 10) / 10,
      source: "fitbit_body",
    };
    if (entry.fat != null) row.body_fat_pct = Math.round((entry.fat as number) * 10) / 10;
    if (entry.bmi != null) row.bmi = Math.round((entry.bmi as number) * 10) / 10;
    bodyRows.push(row);
  }

  // Skip dates that already have body fat % from any source
  let bodyWritten = 0;
  if (bodyRows.length) {
    const { data: existingRich } = await db
      .from("fitness_log")
      .select("date")
      .not("body_fat_pct", "is", null);
    const { data: existingFitbit } = await db
      .from("fitness_log")
      .select("date")
      .eq("source", "fitbit_body");

    const skip = new Set([
      ...((existingRich ?? []) as { date: string }[]).map((r) => r.date),
      ...((existingFitbit ?? []) as { date: string }[]).map((r) => r.date),
    ]);

    const newRows = bodyRows.filter((r) => !skip.has(r.date as string));
    if (newRows.length) {
      const { error } = await db.from("fitness_log").insert(newRows);
      if (error) throw new Error(`fitness_log insert: ${error.message}`);
      bodyWritten = newRows.length;
    }
  }

  // ── Workouts ──────────────────────────────────────────────────────────────

  const workoutRows: Record<string, unknown>[] = [];
  for (const a of (workoutData.activities as Record<string, unknown>[] | undefined) ?? []) {
    const rawStart = (a.startTime ?? a.originalStartTime ?? "") as string;
    const dateStr = rawStart.slice(0, 10);
    if (!dateStr || dateStr < startStr || dateStr > endStr) continue;

    const durationMin = Math.round(((a.duration as number) ?? 0) / 60000);
    if (durationMin < 5) continue;

    const timeStr = rawStart.length >= 19 ? rawStart.slice(11, 19) : null;
    const avgHr = a.averageHeartRate as number | undefined;
    const calories = a.calories as number | undefined;
    const zones = (a.heartRateZones as Record<string, unknown>[] | undefined) ?? [];

    workoutRows.push({
      date: dateStr,
      start_time: timeStr,
      activity: (a.activityName as string) ?? "Unknown",
      duration_mins: durationMin,
      calories: calories != null ? Math.round(calories) : null,
      avg_hr: avgHr != null ? Math.round(avgHr) : null,
      source: "fitbit",
      metadata: { hr_zones: fmtHrZones(zones) },
      _key: `${dateStr}|${timeStr}|${(a.activityName as string) ?? ""}`,
    });
  }

  let workoutsWritten = 0;
  if (workoutRows.length) {
    const { data: existingWorkouts } = await db
      .from("workout_sessions")
      .select("date,start_time,activity")
      .eq("source", "fitbit");

    const existingKeys = new Set(
      ((existingWorkouts ?? []) as { date: string; start_time: string; activity: string }[]).map(
        (r) => `${r.date}|${r.start_time}|${r.activity}`,
      ),
    );

    const newWorkouts = workoutRows
      .filter((r) => !existingKeys.has(r._key as string))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ _key, ...rest }) => rest);

    if (newWorkouts.length) {
      const { error } = await db.from("workout_sessions").insert(newWorkouts);
      if (error) throw new Error(`workout_sessions insert: ${error.message}`);
      workoutsWritten = newWorkouts.length;
    }
  }

  await logSync(db, "fitbit", "ok", bodyWritten + workoutsWritten);
  return { bodyWritten, workoutsWritten };
}
