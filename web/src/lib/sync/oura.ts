import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "./log";

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";

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
    if (!required && [400, 403, 404, 422].includes(res.status)) return null;
    throw new Error(`Oura ${endpoint} returned ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export interface OuraSyncResult {
  updated: number;
}

export async function syncOura(db: SupabaseClient, days = 3): Promise<OuraSyncResult> {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) throw new Error("OURA_ACCESS_TOKEN not configured");

  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - days);
  const startStr = past.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

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
      avg_hr_sleep: d.average_heart_rate != null ? Math.round(d.average_heart_rate as number) : null,
      avg_breath: d.average_breath != null ? Math.round((d.average_breath as number) * 10) / 10 : null,
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
    if (sd.awake_hrs != null) meta.awake_hrs = sd.awake_hrs;
    if (sd.efficiency != null) meta.sleep_efficiency = sd.efficiency;
    if (sd.latency_mins != null) meta.latency_mins = sd.latency_mins;
    if (sd.avg_breath != null) meta.avg_breath = sd.avg_breath;
    if (sd.avg_hr_sleep != null) meta.avg_hr_sleep = sd.avg_hr_sleep;
    if (sd.restless_periods != null) meta.restless_periods = sd.restless_periods;
    if (act.total_cal != null) meta.total_calories = act.total_cal;
    if (st.stress_high_mins != null) meta.stress_high_mins = st.stress_high_mins;
    if (st.stress_recovery_mins != null) meta.stress_recovery_mins = st.stress_recovery_mins;
    if (st.stress_day_summary) meta.stress_day_summary = st.stress_day_summary;
    if (resilience[d]) meta.resilience_level = resilience[d];
    if (vo2[d] != null) meta.vo2_max = vo2[d];

    return {
      date: d,
      bedtime: sd.bedtime ?? null,
      total_sleep_hrs: sd.total_sleep_hrs ?? null,
      light_hrs: sd.light_hrs ?? null,
      deep_hrs: sd.deep_hrs ?? null,
      rem_hrs: sd.rem_hrs ?? null,
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

  const { error } = await db.from("recovery_metrics").upsert(rows, { onConflict: "date" });
  if (error) throw new Error(error.message);

  await logSync(db, "oura", "ok", rows.length);
  return { updated: rows.length };
}
