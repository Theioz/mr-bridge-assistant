import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "./log";
import { loadIntegration } from "@/lib/integrations/tokens";

const SYNC_DAYS = 7;

const BODY_DATA_TYPES = [
  "com.google.weight",
  "com.google.body_fat_percentage",
  "com.google.bmi",
  "com.google.lean_body_mass",
  "com.google.hydration",
  "com.google.basal_metabolic_rate",
  "com.google.height",
];

// ---------------------------------------------------------------------------
// OAuth token exchange (refresh token → access token)
// ---------------------------------------------------------------------------

async function getGoogleAccessToken(db: SupabaseClient, userId: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  const integration = await loadIntegration(db, userId, "google").catch(() => null);
  if (!integration) {
    throw new Error("Google account not connected. Connect Google in Settings.");
  }
  const refreshToken = integration.refreshToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

// ---------------------------------------------------------------------------
// Google Fit API helpers
// ---------------------------------------------------------------------------

async function fitGet(
  accessToken: string,
  endpoint: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.googleapis.com/fitness/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Fit GET ${endpoint} returned ${res.status}: ${body}`);
  }
  return res.json();
}

async function fitPost(
  accessToken: string,
  endpoint: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.googleapis.com/fitness/v1/users/me/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Fit POST ${endpoint} returned ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export interface GoogleFitSyncResult {
  written: number;
}

export async function syncGoogleFit(db: SupabaseClient, userId: string): Promise<GoogleFitSyncResult> {
  const accessToken = await getGoogleAccessToken(db, userId);

  // Discover available body datasources
  const sourcesResult = await fitGet(accessToken, "dataSources");
  const typeToSources: Record<string, string[]> = {};
  for (const ds of (sourcesResult.dataSource as Record<string, unknown>[] | undefined) ?? []) {
    const dtName = (ds.dataType as Record<string, string> | undefined)?.name ?? "";
    if (!BODY_DATA_TYPES.includes(dtName)) continue;
    const dsId = ds.dataStreamId as string | undefined;
    if (dsId) {
      if (!typeToSources[dtName]) typeToSources[dtName] = [];
      typeToSources[dtName].push(dsId);
    }
  }

  if (!Object.keys(typeToSources).length) return { written: 0 };

  // Aggregate body data for last SYNC_DAYS days
  const now = Date.now();
  const startMs = now - SYNC_DAYS * 24 * 60 * 60 * 1000;

  const aggregateBy = Object.values(typeToSources)
    .flat()
    .map((dsId) => ({ dataSourceId: dsId }));

  const aggResult = await fitPost(accessToken, "dataset:aggregate", {
    aggregateBy,
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis: startMs,
    endTimeMillis: now,
  });

  const rows: Record<string, unknown>[] = [];
  for (const bucket of (aggResult.bucket as Record<string, unknown>[] | undefined) ?? []) {
    const dateStr = new Date(parseInt(bucket.startTimeMillis as string))
      .toISOString()
      .slice(0, 10);

    // Index points by data type
    const byType: Record<string, { value: { fpVal?: number }[] }[]> = {};
    for (const dataset of (bucket.dataset as Record<string, unknown>[] | undefined) ?? []) {
      const dsId = dataset.dataSourceId as string;
      for (const dtype of BODY_DATA_TYPES) {
        if (dsId.includes(dtype)) {
          if (!byType[dtype]) byType[dtype] = [];
          byType[dtype].push(...(dataset.point as { value: { fpVal?: number }[] }[]));
        }
      }
    }

    const firstFp = (dtype: string): number | null => {
      const points = byType[dtype] ?? [];
      if (!points.length) return null;
      return points[0].value?.[0]?.fpVal ?? null;
    };

    const weightKg = firstFp("com.google.weight");
    const leanKg = firstFp("com.google.lean_body_mass");
    const fatPct = firstFp("com.google.body_fat_percentage");
    const bmiVal = firstFp("com.google.bmi");
    const hydrationL = firstFp("com.google.hydration");
    const bmr = firstFp("com.google.basal_metabolic_rate");
    const heightM = firstFp("com.google.height");

    const meta: Record<string, number> = {};
    if (hydrationL != null) meta.body_water_l = Math.round(hydrationL * 100) / 100;
    if (bmr != null) meta.bmr_kcal = Math.round(bmr * 10) / 10;
    if (heightM != null) meta.height_m = Math.round(heightM * 1000) / 1000;

    const row: Record<string, unknown> = {
      date: dateStr,
      weight_lb: weightKg != null ? Math.round(weightKg * 2.20462 * 10) / 10 : null,
      body_fat_pct: fatPct != null ? Math.round(fatPct * 10) / 10 : null,
      bmi: bmiVal != null ? Math.round(bmiVal * 10) / 10 : null,
      muscle_mass_lb: leanKg != null ? Math.round(leanKg * 2.20462 * 10) / 10 : null,
      metadata: Object.keys(meta).length ? meta : null,
    };

    // Only include rows that have at least one numeric value
    if (Object.entries(row).some(([k, v]) => !["date", "metadata"].includes(k) && v != null)) {
      rows.push(row);
    }
  }

  if (!rows.length) return { written: 0 };

  // Skip dates that already have body fat % (from any source) or are already from google_fit
  const { data: existingRich } = await db
    .from("fitness_log")
    .select("date")
    .eq("user_id", userId)
    .not("body_fat_pct", "is", null);
  const { data: existingGfit } = await db
    .from("fitness_log")
    .select("date")
    .eq("user_id", userId)
    .eq("source", "google_fit");

  const skip = new Set([
    ...((existingRich ?? []) as { date: string }[]).map((r) => r.date),
    ...((existingGfit ?? []) as { date: string }[]).map((r) => r.date),
  ]);

  const newRows = rows
    .filter((r) => !skip.has(r.date as string))
    .map((r) => ({ ...r, user_id: userId, source: "google_fit" }));

  if (!newRows.length) return { written: 0 };

  const { error } = await db.from("fitness_log").insert(newRows);
  if (error) throw new Error(`fitness_log insert: ${error.message}`);

  await logSync(db, "google_fit", "ok", newRows.length);
  return { written: newRows.length };
}
