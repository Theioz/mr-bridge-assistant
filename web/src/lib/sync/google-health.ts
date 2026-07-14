import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "./log";
import { todayString, daysAgoString, addDays } from "@/lib/timezone";
import { loadIntegration } from "@/lib/integrations/tokens";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const HEALTH_API_BASE = "https://health.googleapis.com/v4";
const SYNC_DAYS = 7;

// Rows previously written by the Fitbit and Google Fit syncs. Google Health serves the
// same underlying device data, so dedup must consider them or every workout already
// stored as "fitbit" would be re-inserted as "google_health" at cutover.
const WORKOUT_SOURCES = ["google_health", "fitbit"];
const BODY_SOURCES = ["google_health", "fitbit_body", "google_fit"];

// ---------------------------------------------------------------------------
// Google Health v4 response shapes (only the fields this sync consumes).
// Verified against the v4 discovery doc, rev 20260713.
// ---------------------------------------------------------------------------

interface CivilDateTime {
  date?: { year?: number; month?: number; day?: number };
  time?: { hours?: number; minutes?: number; seconds?: number };
}

interface DataPoint {
  weight?: { sampleTime?: { civilTime?: CivilDateTime }; weightGrams?: number };
  bodyFat?: { sampleTime?: { civilTime?: CivilDateTime }; percentage?: number };
  height?: { heightMillimeters?: number };
  exercise?: {
    interval?: { civilStartTime?: CivilDateTime };
    exerciseType?: string;
    displayName?: string;
    activeDuration?: string;
    metricsSummary?: {
      averageHeartRateBeatsPerMinute?: string;
      caloriesKcal?: number;
      heartRateZoneDurations?: {
        lightTime?: string;
        moderateTime?: string;
        vigorousTime?: string;
        peakTime?: string;
      };
    };
  };
}

// ---------------------------------------------------------------------------
// OAuth — the Google Health token lives under its own provider row, separate from
// the "google" (Calendar/Gmail/Fit) token. Google revokes refresh tokens carrying
// Gmail scopes when the account password changes; keeping the health token free of
// Gmail scopes means a password change doesn't take the fitness sync down with it.
// ---------------------------------------------------------------------------

async function getAccessToken(db: SupabaseClient, userId: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  const integration = await loadIntegration(db, userId, "google_health");
  if (!integration?.refreshToken) {
    throw new Error("Google Health not connected — authorize via Settings");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Google Health token refresh failed ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).access_token as string;
}

// ---------------------------------------------------------------------------
// dataPoints.list — paginated. `exercise` caps pageSize at 25, so paging is not
// optional here the way a single limit=100 call was against Fitbit.
// ---------------------------------------------------------------------------

async function listDataPoints(
  accessToken: string,
  dataType: string,
  filter?: string,
  pageSize = 100,
): Promise<DataPoint[]> {
  const points: DataPoint[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (filter) params.set("filter", filter);
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(`Google Health ${dataType} returned ${res.status}: ${await res.text()}`);
    }

    const body = await res.json();
    points.push(...((body.dataPoints as DataPoint[] | undefined) ?? []));
    pageToken = body.nextPageToken as string | undefined;
  } while (pageToken);

  return points;
}

// ---------------------------------------------------------------------------
// Civil time = the user's local wall-clock time, supplied by the API directly.
// This is the equivalent of Fitbit's local timestamps; no offset math needed.
// ---------------------------------------------------------------------------

function civilDate(c: CivilDateTime | undefined): string | null {
  const d = c?.date;
  if (!d?.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function civilTime(c: CivilDateTime | undefined): string | null {
  const t = c?.time;
  if (!t) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.hours ?? 0)}:${pad(t.minutes ?? 0)}:${pad(t.seconds ?? 0)}`;
}

// Filters take civil time as an unzoned RFC-3339-style literal, and use the
// snake_case data-type name (the URL path uses kebab-case).
function civilRangeFilter(field: string, startStr: string, endStr: string): string {
  return `${field} >= "${startStr}T00:00:00" AND ${field} < "${endStr}T00:00:00"`;
}

// google-duration — "3600s", possibly fractional ("3600.5s").
function durationSecs(d: string | undefined): number {
  if (!d) return 0;
  const n = parseFloat(d.replace(/s$/, ""));
  return Number.isFinite(n) ? n : 0;
}

// Google's four zones replace Fitbit's Fat Burn / Cardio / Peak. Ordered hardest-first,
// matching how fmtHrZones rendered the Fitbit set. Zone names differ from historical
// rows — see the changeover note in CHANGELOG.
function fmtHrZones(z: Record<string, string | undefined> | undefined): string | null {
  if (!z) return null;
  const zones: [string, number][] = [
    ["Peak", durationSecs(z.peakTime)],
    ["Vigorous", durationSecs(z.vigorousTime)],
    ["Moderate", durationSecs(z.moderateTime)],
    ["Light", durationSecs(z.lightTime)],
  ];
  const parts = zones
    .filter(([, secs]) => secs > 0)
    .map(([name, secs]) => `${name}: ${Math.round(secs / 60)}m`);
  return parts.length ? parts.join(" | ") : null;
}

// Canonical activity names. Fitbit returned display strings ("Walking"); Google returns
// an exerciseType enum ("WALKING") across 182 values. Map the ones that had aliases and
// title-case the rest so the label stays human-readable in history views.
const ACTIVITY_ALIASES: Record<string, string> = {
  WALKING: "Walk",
  RUNNING: "Run",
  TREADMILL_RUNNING: "Run",
  BIKING: "Bike",
  BIKING_STATIONARY: "Bike",
  MOUNTAIN_BIKING: "Bike",
  ELECTRIC_BIKE: "Bike",
  SWIMMING: "Swim",
  SWIMMING_POOL: "Swim",
  SWIMMING_OPEN_WATER: "Swim",
  HIKING: "Hike",
  WEIGHTLIFTING: "Strength",
  STRENGTH_TRAINING: "Strength",
};

function titleCase(enumName: string): string {
  return enumName
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizeActivity(exerciseType: string | undefined, displayName?: string): string {
  if (!exerciseType || exerciseType === "EXERCISE_TYPE_UNSPECIFIED") {
    return displayName || "Unknown";
  }
  return ACTIVITY_ALIASES[exerciseType] ?? titleCase(exerciseType);
}

function timeToMins(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

export interface GoogleHealthSyncResult {
  bodyWritten: number;
  workoutsWritten: number;
}

export async function syncGoogleHealth(
  db: SupabaseClient,
  userId: string,
): Promise<GoogleHealthSyncResult> {
  const accessToken = await getAccessToken(db, userId);

  const startStr = daysAgoString(SYNC_DAYS);
  // The filter's upper bound is exclusive, so it must land on the day *after* today for
  // today's own samples to be included.
  const endExclusive = addDays(todayString(), 1);

  const [weightPoints, fatPoints, heightPoints, exercisePoints] = await Promise.all([
    listDataPoints(
      accessToken,
      "weight",
      civilRangeFilter("weight.sample_time.civil_time", startStr, endExclusive),
    ),
    listDataPoints(
      accessToken,
      "body-fat",
      civilRangeFilter("body_fat.sample_time.civil_time", startStr, endExclusive),
    ),
    // Height changes rarely and is only needed to derive BMI — take the latest on file.
    listDataPoints(accessToken, "height", undefined, 1),
    listDataPoints(
      accessToken,
      "exercise",
      civilRangeFilter("exercise.interval.civil_start_time", startStr, endExclusive),
      25, // exercise caps pageSize at 25
    ),
  ]);

  // ── Body composition ──────────────────────────────────────────────────────
  //
  // Google Health has no `bmi` data type (Fitbit supplied one directly), so BMI is
  // derived from weight + height. Height is a separate sample, not part of the weight
  // reading; if the user has never recorded one, BMI stays null rather than guessed.

  const heightM = (heightPoints[0]?.height?.heightMillimeters ?? 0) / 1000 || null;

  const byDate = new Map<string, { weightKg?: number; fatPct?: number }>();
  for (const p of weightPoints) {
    const date = civilDate(p.weight?.sampleTime?.civilTime);
    const grams = p.weight?.weightGrams;
    if (!date || grams == null) continue;
    byDate.set(date, { ...byDate.get(date), weightKg: grams / 1000 });
  }
  for (const p of fatPoints) {
    const date = civilDate(p.bodyFat?.sampleTime?.civilTime);
    const pct = p.bodyFat?.percentage;
    if (!date || pct == null) continue;
    byDate.set(date, { ...byDate.get(date), fatPct: pct });
  }

  const bodyRows: Record<string, unknown>[] = [];
  for (const [date, m] of byDate) {
    if (m.weightKg == null) continue;
    const row: Record<string, unknown> = {
      date,
      weight_lb: Math.round(m.weightKg * 2.20462 * 10) / 10,
      source: "google_health",
      // `{}`, not null — fitness_log.metadata is `jsonb NOT NULL DEFAULT '{}'`, and a
      // DEFAULT only applies when the column is omitted. An explicit null violates it.
      metadata: {},
    };
    if (m.fatPct != null) row.body_fat_pct = Math.round(m.fatPct * 10) / 10;
    if (heightM) row.bmi = Math.round((m.weightKg / (heightM * heightM)) * 10) / 10;
    bodyRows.push(row);
  }

  let bodyWritten = 0;
  if (bodyRows.length) {
    // Skip dates that already carry body fat % from any source, and dates already
    // written by a body-composition source (including the retired Fitbit/Google Fit ones).
    const { data: existingRich } = await db
      .from("fitness_log")
      .select("date")
      .eq("user_id", userId)
      .not("body_fat_pct", "is", null);
    const { data: existingBody } = await db
      .from("fitness_log")
      .select("date")
      .eq("user_id", userId)
      .in("source", BODY_SOURCES);

    const skip = new Set([
      ...((existingRich ?? []) as { date: string }[]).map((r) => r.date),
      ...((existingBody ?? []) as { date: string }[]).map((r) => r.date),
    ]);

    const newRows = bodyRows
      .filter((r) => !skip.has(r.date as string))
      .map((r) => ({ ...r, user_id: userId }));
    if (newRows.length) {
      const { error } = await db.from("fitness_log").insert(newRows);
      if (error) throw new Error(`fitness_log insert: ${error.message}`);
      bodyWritten = newRows.length;
    }
  }

  // ── Workouts ──────────────────────────────────────────────────────────────

  const workoutRows: Record<string, unknown>[] = [];
  for (const p of exercisePoints) {
    const ex = p.exercise;
    if (!ex) continue;

    const date = civilDate(ex.interval?.civilStartTime);
    if (!date) continue;

    // activeDuration excludes pauses; Fitbit's `duration` did not. Slightly stricter,
    // and the right number — a paused workout shouldn't count the pause.
    const durationMin = Math.round(durationSecs(ex.activeDuration) / 60);
    if (durationMin < 5) continue;

    const timeStr = civilTime(ex.interval?.civilStartTime);
    const metrics = ex.metricsSummary;
    const avgHrRaw = metrics?.averageHeartRateBeatsPerMinute;
    const avgHr = avgHrRaw != null ? Number(avgHrRaw) : null;
    const calories = metrics?.caloriesKcal;
    const activity = normalizeActivity(ex.exerciseType, ex.displayName);

    workoutRows.push({
      date,
      start_time: timeStr,
      activity,
      duration_mins: durationMin,
      calories: calories != null ? Math.round(calories) : null,
      avg_hr: avgHr != null && Number.isFinite(avgHr) ? Math.round(avgHr) : null,
      source: "google_health",
      metadata: { hr_zones: fmtHrZones(metrics?.heartRateZoneDurations) },
      _key: `${date}|${timeStr}|${activity}`,
    });
  }

  let workoutsWritten = 0;
  if (workoutRows.length) {
    const { data: existingWorkouts } = await db
      .from("workout_sessions")
      .select("id,date,start_time,activity,avg_hr,duration_mins,source")
      .eq("user_id", userId)
      .in("source", WORKOUT_SOURCES);

    const existingList = (existingWorkouts ?? []) as {
      id: string;
      date: string;
      start_time: string | null;
      activity: string;
      avg_hr: number | null;
      duration_mins: number | null;
    }[];

    const existingKeys = new Set(
      existingList.map((r) => `${r.date}|${r.start_time}|${r.activity}`),
    );
    const exactNew = workoutRows.filter((r) => !existingKeys.has(r._key as string));

    // Time-overlap detection (±5 min on same date). Unlike the Fitbit sync, an
    // overlapping row is never replaced: the pre-existing row is the same workout
    // already stored under the old source, so re-inserting or swapping it would churn
    // history for no gain.
    const OVERLAP_MINS = 5;
    const dateIndex = new Map<string, typeof existingList>();
    for (const r of existingList) dateIndex.set(r.date, [...(dateIndex.get(r.date) ?? []), r]);

    const toInsert = exactNew.filter((newRow) => {
      const newMins = timeToMins(newRow.start_time as string | null);
      for (const ex of dateIndex.get(newRow.date as string) ?? []) {
        const exMins = timeToMins(ex.start_time);
        if (newMins == null || exMins == null) continue;
        if (Math.abs(newMins - exMins) <= OVERLAP_MINS) return false;
      }
      return true;
    });

    const newWorkouts = toInsert.map(({ _key, ...rest }) => ({ ...rest, user_id: userId }));
    if (newWorkouts.length) {
      const { error } = await db.from("workout_sessions").insert(newWorkouts);
      if (error) throw new Error(`workout_sessions insert: ${error.message}`);
      workoutsWritten = newWorkouts.length;
    }
  }

  await logSync(db, "google_health", "ok", bodyWritten + workoutsWritten);
  return { bodyWritten, workoutsWritten };
}
