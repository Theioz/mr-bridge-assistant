import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "./log";
import { todayString, daysAgoString } from "@/lib/timezone";
import { loadIntegration, persistRotatedToken } from "@/lib/integrations/tokens";

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
export const OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
export const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

// Scopes requested per connection. `daily` is the load-bearing one — it carries /sleep,
// /daily_readiness, /daily_sleep, /daily_activity and /vo2_max, every endpoint this sync
// treats as required. `spo2` covers /daily_spo2 alone.
//
// Oura's scope vocabulary is wider than its published docs page (the developer console also
// offers Stress, Heart Health and Ring Configuration), and requesting a scope the console
// does not recognise fails the whole authorize round-trip. OURA_SCOPES overrides this default
// from the environment so a scope can be added without a rebuild — the optional endpoints
// (spo2, stress, resilience, vo2_max) already degrade to null on 403 rather than failing.
const DEFAULT_OURA_SCOPES = ["daily", "spo2"];

export function ouraScopes(): string[] {
  const raw = process.env.OURA_SCOPES?.trim();
  if (!raw) return DEFAULT_OURA_SCOPES;
  return raw.split(/[\s,]+/).filter(Boolean);
}

/**
 * Exchanges the stored refresh token for a short-lived access token.
 *
 * Oura rotates the refresh token on each exchange, so a returned one MUST be persisted or the
 * next unattended run authenticates with a spent credential. A failure to persist therefore
 * throws rather than being swallowed: the rotation has already happened server-side, and
 * reporting success here would leave the next cron run to fail with a misleading error.
 */
async function accessTokenFor(
  db: SupabaseClient,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("OURA_CLIENT_ID and OURA_CLIENT_SECRET must be set");
  }

  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      throw new Error(`Oura refresh token rejected (${res.status}) — reconnect Oura in Settings`);
    }
    throw new Error(`Oura token refresh failed ${res.status}: ${await res.text()}`);
  }

  const tokens = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token) throw new Error("Oura token refresh returned no access_token");

  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    await persistRotatedToken(db, userId, "oura", tokens.refresh_token);
  }

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function secsToHrs(s: number | null | undefined): number | null {
  if (s == null) return null;
  return Math.round((s / 3600) * 1000) / 1000;
}

function secsToMins(s: number | null | undefined): number | null {
  if (s == null) return null;
  return Math.round((s / 60) * 10) / 10;
}

function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(11, 19);
}

async function ouraGet(
  endpoint: string,
  start: string,
  end: string,
  token: string,
  required = true,
): Promise<Record<string, unknown> | null> {
  const url = `${OURA_BASE}/${endpoint}?start_date=${start}&end_date=${end}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // An OPTIONAL endpoint is optional precisely because it may not be available on this
    // account or under the granted scopes, and Oura signals that inconsistently: daily_spo2
    // answers 403, daily_resilience answers 401. Degrade either one to null rather than
    // letting a nice-to-have metric take sleep and readiness down with it.
    //
    // This cannot mask a genuinely dead authorisation: the required endpoints (sleep,
    // daily_readiness, daily_sleep, daily_activity) would 401 too and still throw. Warn so a
    // silently-missing metric is visible in the container log instead of just absent.
    if (!required && [400, 401, 403, 404, 422].includes(res.status)) {
      console.warn(`[oura] ${endpoint} unavailable (${res.status}) — skipped, not fatal`);
      return null;
    }
    // 401 and 403 mean different repairs — a dead authorisation versus a scope that was never
    // granted — and saying which saves re-deriving it from a bare status code.
    if (res.status === 401) {
      throw new Error(
        `Oura ${endpoint} returned 401 — the Oura authorisation is no longer valid; reconnect in Settings`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `Oura ${endpoint} returned 403 — granted scopes do not cover it (requested: ${ouraScopes().join(" ")})`,
      );
    }
    throw new Error(`Oura ${endpoint} returned ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export interface OuraSyncResult {
  /** Rows upserted, including days Oura returned only an empty activity stub for. */
  updated: number;
  /** Of those, the rows actually carrying sleep or readiness. This is the honest number. */
  withData: number;
}

export async function syncOura(
  db: SupabaseClient,
  userId: string,
  days = 3,
): Promise<OuraSyncResult> {
  const integration = await loadIntegration(db, userId, "oura");
  if (!integration?.refreshToken) {
    throw new Error("Oura not connected — connect Oura in Settings");
  }
  const token = await accessTokenFor(db, userId, integration.refreshToken);

  const startStr = daysAgoString(days);
  const endStr = todayString();

  const [
    sleepData,
    readinessData,
    sleepScoreData,
    activityData,
    spo2Data,
    stressData,
    resilienceData,
    vo2Data,
  ] = await Promise.all([
    ouraGet("sleep", startStr, endStr, token),
    ouraGet("daily_readiness", startStr, endStr, token),
    ouraGet("daily_sleep", startStr, endStr, token),
    ouraGet("daily_activity", startStr, endStr, token),
    ouraGet("daily_spo2", startStr, endStr, token, false),
    ouraGet("daily_stress", startStr, endStr, token, false),
    ouraGet("daily_resilience", startStr, endStr, token, false),
    ouraGet("vo2_max", startStr, endStr, token, false),
  ]);

  type SleepDetail = Record<string, number | string | null>;
  const sleepDetail: Record<string, SleepDetail> = {};
  for (const d of (sleepData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (d.type !== "long_sleep" || !d.day) continue;
    const day = d.day as string;
    sleepDetail[day] = {
      bedtime: fmtTime(d.bedtime_start as string),
      bedtime_end: fmtTime(d.bedtime_end as string),
      total_sleep_hrs: secsToHrs(d.total_sleep_duration as number),
      light_hrs: secsToHrs(d.light_sleep_duration as number),
      deep_hrs: secsToHrs(d.deep_sleep_duration as number),
      rem_hrs: secsToHrs(d.rem_sleep_duration as number),
      awake_hrs: secsToHrs(d.awake_time as number),
      avg_hrv: d.average_hrv != null ? Math.round(d.average_hrv as number) : null,
      resting_hr: (d.lowest_heart_rate as number) ?? null,
      avg_hr_sleep:
        d.average_heart_rate != null ? Math.round(d.average_heart_rate as number) : null,
      avg_breath:
        d.average_breath != null ? Math.round((d.average_breath as number) * 10) / 10 : null,
      efficiency: (d.efficiency as number) ?? null,
      latency_mins: secsToMins(d.latency as number),
      restless_periods: (d.restless_periods as number) ?? null,
    };
  }

  const readiness: Record<string, number | null> = {};
  const bodyTemp: Record<string, number | null> = {};
  for (const d of (readinessData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (!d.day) continue;
    const day = d.day as string;
    readiness[day] = (d.score as number) ?? null;
    bodyTemp[day] = (d.temperature_deviation as number) ?? null;
  }

  const sleepScores: Record<string, number | null> = {};
  for (const d of (sleepScoreData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (d.day) sleepScores[d.day as string] = (d.score as number) ?? null;
  }

  type ActivityDetail = Record<string, number | null>;
  const activity: Record<string, ActivityDetail> = {};
  for (const d of (activityData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (!d.day) continue;
    const day = d.day as string;
    activity[day] = {
      active_cal: (d.active_calories as number) ?? null,
      steps: (d.steps as number) ?? null,
      total_cal: (d.total_calories as number) ?? null,
      activity_score: (d.score as number) ?? null,
    };
  }

  const spo2: Record<string, number | null> = {};
  for (const d of (spo2Data?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (!d.day) continue;
    const pct = d.spo2_percentage as Record<string, number> | null;
    spo2[d.day as string] = pct?.average ?? null;
  }

  const stress: Record<string, Record<string, number | string | null>> = {};
  for (const d of (stressData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (!d.day) continue;
    const day = d.day as string;
    stress[day] = {
      stress_high_mins: secsToMins(d.stress_high as number),
      stress_recovery_mins: secsToMins(d.recovery_high as number),
      stress_day_summary: (d.day_summary as string) ?? null,
    };
  }

  const resilience: Record<string, string | null> = {};
  for (const d of (resilienceData?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (d.day) resilience[d.day as string] = (d.level as string) ?? null;
  }

  const vo2: Record<string, number | null> = {};
  for (const d of (vo2Data?.data as Record<string, unknown>[] | undefined) ?? []) {
    if (d.day) vo2[d.day as string] = (d.vo2_max as number) ?? null;
  }

  const allDates = [
    ...new Set([...Object.keys(sleepDetail), ...Object.keys(readiness), ...Object.keys(activity)]),
  ].sort();

  const rows = allDates.map((d) => {
    const sd = sleepDetail[d] ?? {};
    const act = activity[d] ?? {};
    const st = stress[d] ?? {};

    const meta: Record<string, number | string | null> = {};
    if (sd.bedtime_end != null) meta.bedtime_end = sd.bedtime_end;
    if (sd.latency_mins != null) meta.latency_mins = sd.latency_mins;
    if (sd.avg_breath != null) meta.avg_breath = sd.avg_breath;
    if (sd.avg_hr_sleep != null) meta.avg_hr_sleep = sd.avg_hr_sleep;
    if (sd.restless_periods != null) meta.restless_periods = sd.restless_periods;
    if (act.total_cal != null) meta.total_calories = act.total_cal;
    if (st.stress_high_mins != null) meta.stress_high_mins = st.stress_high_mins;
    if (st.stress_recovery_mins != null) meta.stress_recovery_mins = st.stress_recovery_mins;
    if (st.stress_day_summary) meta.stress_day_summary = st.stress_day_summary;
    if (resilience[d]) meta.resilience_level = resilience[d];

    return {
      user_id: userId,
      date: d,
      bedtime: sd.bedtime ?? null,
      total_sleep_hrs: sd.total_sleep_hrs ?? null,
      light_hrs: sd.light_hrs ?? null,
      deep_hrs: sd.deep_hrs ?? null,
      rem_hrs: sd.rem_hrs ?? null,
      awake_hrs: sd.awake_hrs != null ? sd.awake_hrs : null,
      sleep_efficiency: sd.efficiency != null ? sd.efficiency : null,
      vo2_max: vo2[d] ?? null,
      avg_hrv: sd.avg_hrv ?? null,
      resting_hr: sd.resting_hr ?? null,
      readiness: readiness[d] ?? null,
      sleep_score: sleepScores[d] ?? null,
      active_cal: act.active_cal ?? null,
      steps: act.steps ?? null,
      activity_score: act.activity_score ?? null,
      spo2_avg: spo2[d] ?? null,
      body_temp_delta: bodyTemp[d] ?? null,
      metadata: meta,
      source: "oura",
    };
  });

  // `rows.length` counts rows UPSERTED, which a total Oura outage satisfies exactly as well as
  // a healthy sync: Oura keeps emitting daily_activity stubs (steps: 0) for days the ring never
  // recorded, so an all-NULL row still counts one. That is what hid two dark days behind
  // `status: ok, records_written: 3` on 2026-09-19/20. Log the rows that actually carry sleep or
  // readiness, and mark the sync `partial` when none of them do — a signal a failure cannot fake.
  const withData = rows.filter((r) => r.total_sleep_hrs != null || r.readiness != null).length;

  const { error } = await db
    .from("recovery_metrics")
    .upsert(rows, { onConflict: "user_id,date,source" });
  if (error) throw new Error(error.message);

  // `partial` deliberately falls outside lastSyncAgeSecs()'s `status = 'ok'` filter, so a
  // degraded window is retried on the next run instead of being skipped for 30 minutes.
  await logSync(db, "oura", withData > 0 ? "ok" : "partial", withData);
  return { updated: rows.length, withData };
}
