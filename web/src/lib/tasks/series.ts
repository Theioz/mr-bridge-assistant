/**
 * Server-side operations on recurring task series (#468, #689).
 *
 * Shared by the /tasks server actions and the MCP tools so the two cannot drift — the edit-scope
 * rules in particular ("this occurrence" vs "the whole series") are the part that gets skipped and
 * then hurts, and they should exist in exactly one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, validateSeries, type Freq, type SeriesDraft } from "./recurrence";

const SERIES_COLUMNS =
  "id, list_id, title, priority, freq, interval, byweekday, starts_on, ends_on, last_spawned, expiry_dismissed_at, created_at, updated_at";

export interface SeriesResult {
  ok: boolean;
  error?: string;
  series?: Record<string, unknown>;
  spawned?: number;
}

interface CreateArgs {
  supabase: SupabaseClient;
  userId: string;
  title: string;
  freq: Freq;
  interval?: number;
  byweekday?: number[] | null;
  starts_on: string;
  ends_on?: string | null;
  priority?: "high" | "medium" | "low" | null;
  list_id?: string | null;
}

/**
 * Create a series and immediately materialize its occurrences inside the spawn horizon.
 *
 * The eager spawn matters: without it a new series shows nothing on /tasks until the nightly cron
 * runs, which reads as "it didn't work" and invites a duplicate. The cron remains the mechanism
 * that keeps the window full over time.
 */
export async function createSeries(args: CreateArgs): Promise<SeriesResult> {
  const {
    supabase,
    userId,
    title,
    freq,
    interval = 1,
    byweekday,
    starts_on,
    ends_on = null,
    priority = null,
    list_id = null,
  } = args;

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title cannot be empty." };

  const draft: SeriesDraft = {
    freq,
    interval,
    byweekday: byweekday ?? [],
    starts_on,
    ends_on,
  };
  const invalid = validateSeries(draft);
  if (invalid) return { ok: false, error: invalid };

  // A weekly series with no explicit weekday means "the day it starts on". Resolving it here keeps
  // the stored row self-describing rather than leaving the default implicit in two codebases.
  const days =
    freq === "weekly"
      ? [
          ...new Set(
            byweekday && byweekday.length
              ? byweekday
              : [new Date(`${starts_on}T00:00:00`).getDay()],
          ),
        ].sort((a, b) => a - b)
      : null;

  const { data, error } = await supabase
    .from("task_series")
    .insert({
      user_id: userId,
      title: trimmed,
      priority,
      list_id,
      freq,
      interval,
      byweekday: days,
      starts_on,
      ends_on,
    })
    .select(SERIES_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data)
    return { ok: false, error: "Insert returned no row — series may not have been saved." };

  const spawned = await spawnOccurrences({ supabase, userId, seriesId: data.id as string });
  return { ok: true, series: data, spawned };
}

/**
 * Materialize occurrences for one series through today + horizon.
 *
 * A TypeScript twin of scripts/spawn_task_occurrences.py, deliberately: the cron job owns the
 * steady state, but creating or extending a series from the UI has to show its effect in the same
 * request. Both rely on `tasks_series_occurrence_uniq` for idempotence rather than on their own
 * bookkeeping, so running both is safe.
 */
export async function spawnOccurrences({
  supabase,
  userId,
  seriesId,
  horizonDays = 14,
}: {
  supabase: SupabaseClient;
  userId: string;
  seriesId: string;
  horizonDays?: number;
}): Promise<number> {
  const { data: series } = await supabase
    .from("task_series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!series) return 0;

  const today = new Date();
  const todayStr = toDateString(today);
  const horizonEnd = toDateString(new Date(today.getTime() + horizonDays * 86_400_000));
  const windowEnd = series.ends_on && series.ends_on < horizonEnd ? series.ends_on : horizonEnd;

  // Start from starts_on rather than last_spawned. The unique index absorbs the repeats, and
  // recomputing from the anchor means an extended series backfills anything the cron skipped while
  // its ends_on was in the past.
  const dates = occurrenceDates({
    freq: series.freq as Freq,
    interval: series.interval as number,
    byweekday: (series.byweekday as number[] | null) ?? null,
    startsOn: series.starts_on as string,
    windowStart: series.starts_on as string,
    windowEnd,
  });
  if (!dates.length) return 0;

  const { data: existingRows } = await supabase
    .from("tasks")
    .select("occurrence_date")
    .eq("series_id", seriesId)
    .gte("occurrence_date", dates[0])
    .lte("occurrence_date", dates[dates.length - 1]);
  const existing = new Set((existingRows ?? []).map((r) => r.occurrence_date as string));

  const pending = dates.filter((d) => !existing.has(d));
  if (!pending.length) return 0;

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(
      pending.map((d) => ({
        user_id: userId,
        title: series.title,
        priority: series.priority,
        list_id: series.list_id,
        status: "active",
        due_date: d,
        series_id: seriesId,
        occurrence_date: d,
      })),
    )
    .select("id");

  // A unique violation means the cron won the race — the occurrence exists either way, which is
  // the outcome we wanted. Anything else is worth surfacing but never worth failing the caller's
  // create/extend over.
  if (error && !/duplicate key|tasks_series_occurrence_uniq/.test(error.message)) {
    console.error("[series] occurrence insert failed:", error.message);
  }

  const highWater = windowEnd > todayStr ? windowEnd : todayStr;
  await supabase.from("task_series").update({ last_spawned: highWater }).eq("id", seriesId);

  return inserted?.length ?? 0;
}

/** Local YYYY-MM-DD. */
function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

/**
 * Occurrence dates in [windowStart, windowEnd] — the TS mirror of occurrences_between() in
 * scripts/_recurrence.py. Dates always derive from startsOn, never from the previous occurrence,
 * which is what keeps a late-completed chore from dragging the series with it.
 */
export function occurrenceDates({
  freq,
  interval,
  byweekday,
  startsOn,
  windowStart,
  windowEnd,
}: {
  freq: Freq;
  interval: number;
  byweekday: number[] | null;
  startsOn: string;
  windowStart: string;
  windowEnd: string;
}): string[] {
  const n = Math.max(1, Math.trunc(interval || 1));
  const lo = windowStart > startsOn ? windowStart : startsOn;
  const hi = windowEnd;
  if (lo > hi) return [];

  const out: string[] = [];

  if (freq === "daily") {
    const elapsed = Math.round(
      (new Date(`${lo}T00:00:00`).getTime() - new Date(`${startsOn}T00:00:00`).getTime()) /
        86_400_000,
    );
    let cur = addDays(startsOn, Math.ceil(elapsed / n) * n);
    while (cur <= hi) {
      out.push(cur);
      cur = addDays(cur, n);
    }
  } else if (freq === "weekly") {
    const days = [...new Set(byweekday && byweekday.length ? byweekday : [dowOf(startsOn)])].sort(
      (a, b) => a - b,
    );
    const week0 = addDays(startsOn, -dowOf(startsOn));
    let curWeek = week0;
    if (lo > curWeek) {
      const weeksElapsed = Math.floor(
        (new Date(`${lo}T00:00:00`).getTime() - new Date(`${curWeek}T00:00:00`).getTime()) /
          (7 * 86_400_000),
      );
      curWeek = addDays(curWeek, (weeksElapsed - (weeksElapsed % n)) * 7);
    }
    while (curWeek <= hi) {
      for (const wd of days) {
        const d = addDays(curWeek, wd);
        // `>= startsOn` matters in the first week: a Mon/Thu series starting Wednesday must not
        // emit that week's Monday.
        if (d >= lo && d <= hi && d >= startsOn) out.push(d);
      }
      curWeek = addDays(curWeek, 7 * n);
    }
  } else {
    let i = 0;
    for (;;) {
      const d = addMonths(startsOn, i * n);
      if (d > hi) break;
      if (d >= lo) out.push(d);
      i += 1;
    }
  }

  return [...new Set(out)].sort();
}

/**
 * Extend a series' end date and immediately backfill the occurrences the new window opens up.
 * Clears the expiry dismissal so a later approach to the *new* end date warns again.
 */
export async function extendSeries({
  supabase,
  userId,
  seriesId,
  newEndsOn,
  months = 3,
}: {
  supabase: SupabaseClient;
  userId: string;
  seriesId: string;
  newEndsOn?: string | null;
  months?: number;
}): Promise<SeriesResult> {
  const { data: series } = await supabase
    .from("task_series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!series) return { ok: false, error: "Series not found." };

  // Default: three months past whichever is later, today or the current end. Extending from a
  // date already in the past would produce a window that is still expired.
  const todayStr = toDateString(new Date());
  const base =
    series.ends_on && (series.ends_on as string) > todayStr ? (series.ends_on as string) : todayStr;
  const target = newEndsOn ?? addMonths(base, months);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(target))
    return { ok: false, error: "End date must be YYYY-MM-DD." };
  if (target < (series.starts_on as string))
    return { ok: false, error: "End date must be on or after the series start date." };

  const { data, error } = await supabase
    .from("task_series")
    .update({ ends_on: target, expiry_dismissed_at: null })
    .eq("id", seriesId)
    .eq("user_id", userId)
    .select(SERIES_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };

  const spawned = await spawnOccurrences({ supabase, userId, seriesId });
  return { ok: true, series: data ?? undefined, spawned };
}

/** "Let it end" — suppress the expiry warning permanently. An explicit dismissal is not forgetting. */
export async function dismissSeriesExpiry({
  supabase,
  userId,
  seriesId,
}: {
  supabase: SupabaseClient;
  userId: string;
  seriesId: string;
}): Promise<SeriesResult> {
  const { data, error } = await supabase
    .from("task_series")
    .update({ expiry_dismissed_at: new Date().toISOString() })
    .eq("id", seriesId)
    .eq("user_id", userId)
    .select(SERIES_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Series not found." };
  return { ok: true, series: data };
}

/**
 * Update the RULE, and re-point future occurrences at it.
 *
 * "The whole series" cannot mean "rewrite every row ever generated" — completed occurrences are
 * history and must keep the title they were done under. So: future *active* occurrences are
 * deleted and regenerated from the new rule, and anything completed, archived, or already past is
 * left exactly as it was.
 */
export async function updateSeries({
  supabase,
  userId,
  seriesId,
  fields,
}: {
  supabase: SupabaseClient;
  userId: string;
  seriesId: string;
  fields: Partial<{
    title: string;
    priority: string | null;
    list_id: string | null;
    freq: Freq;
    interval: number;
    byweekday: number[] | null;
    starts_on: string;
    ends_on: string | null;
  }>;
}): Promise<SeriesResult> {
  const { data: current } = await supabase
    .from("task_series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Series not found." };

  const merged: SeriesDraft = {
    freq: (fields.freq ?? current.freq) as Freq,
    interval: fields.interval ?? (current.interval as number),
    byweekday: (fields.byweekday ?? (current.byweekday as number[] | null) ?? []) as number[],
    starts_on: fields.starts_on ?? (current.starts_on as string),
    ends_on: fields.ends_on !== undefined ? fields.ends_on : (current.ends_on as string | null),
  };
  const invalid = validateSeries(merged);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase
    .from("task_series")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", seriesId)
    .eq("user_id", userId)
    .select(SERIES_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };

  // Clear only future, still-active occurrences, then regenerate. `gte today` keeps today's chore
  // if it is already done and rebuilds it if it is not — the rule changed, so an untouched future
  // row should follow the new rule.
  const todayStr = toDateString(new Date());
  await supabase
    .from("tasks")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("occurrence_date", todayStr);

  const spawned = await spawnOccurrences({ supabase, userId, seriesId });
  return { ok: true, series: data ?? undefined, spawned };
}

/**
 * Delete a series. Completed occurrences survive as ordinary tasks — the FK is `on delete set
 * null` — but future *active* ones are removed, because leaving them would be a chore list for a
 * series the user just cancelled.
 */
export async function deleteSeries({
  supabase,
  userId,
  seriesId,
}: {
  supabase: SupabaseClient;
  userId: string;
  seriesId: string;
}): Promise<SeriesResult> {
  const todayStr = toDateString(new Date());
  await supabase
    .from("tasks")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("occurrence_date", todayStr);

  const { error } = await supabase
    .from("task_series")
    .delete()
    .eq("id", seriesId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Detach a single occurrence from its series — the "this occurrence only" edit path.
 *
 * Clearing `series_id` is what makes the edit stick: leave it attached and a rule change would
 * regenerate over the top of it. The row stays in the task list exactly where it was.
 */
export async function detachOccurrence({
  supabase,
  userId,
  taskId,
}: {
  supabase: SupabaseClient;
  userId: string;
  taskId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ series_id: null, occurrence_date: null })
    .eq("id", taskId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Task not found." };
  return { ok: true };
}
