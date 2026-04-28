import type { SupabaseClient } from "@supabase/supabase-js";

export type MetricCategory =
  | "sleep"
  | "hrv"
  | "steps"
  | "active_calories"
  | "readiness"
  | "body_composition";

export type MetricPreferences = Record<MetricCategory, string>;

export const METRIC_DEFAULTS: MetricPreferences = {
  sleep: "oura",
  hrv: "oura",
  steps: "oura",
  active_calories: "oura",
  readiness: "oura",
  body_composition: "fitbit_body",
};

export const ALL_METRICS: MetricCategory[] = [
  "sleep",
  "hrv",
  "steps",
  "active_calories",
  "readiness",
  "body_composition",
];

export async function loadMetricPreferences(
  db: SupabaseClient,
  userId: string,
): Promise<MetricPreferences> {
  const { data } = await db
    .from("user_metric_preferences")
    .select("metric, preferred_source")
    .eq("user_id", userId);

  const prefs = { ...METRIC_DEFAULTS };
  for (const row of (data ?? []) as { metric: string; preferred_source: string }[]) {
    if (row.metric in prefs) {
      (prefs as Record<string, string>)[row.metric] = row.preferred_source;
    }
  }
  return prefs;
}

export async function saveMetricPreference(
  db: SupabaseClient,
  userId: string,
  metric: MetricCategory,
  source: string,
): Promise<void> {
  const { error } = await db
    .from("user_metric_preferences")
    .upsert(
      { user_id: userId, metric, preferred_source: source, updated_at: new Date().toISOString() },
      { onConflict: "user_id,metric" },
    );
  if (error) throw new Error(`saveMetricPreference: ${error.message}`);
}
