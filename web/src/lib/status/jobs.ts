import type { SupabaseClient } from "@supabase/supabase-js";
import registry from "./jobs.json";

/**
 * Status of every scheduled job (Settings → Status, #761).
 *
 * The job list is jobs.json, shared with scripts/check_stale_signals.py so the page and the push
 * alert judge staleness identically. Each job writes a heartbeat row to `sync_log` (the app's
 * syncs via logSync, Python cron jobs via scripts/_joblog.py).
 *
 * The point is to tell "nothing to do" apart from "it broke": a job that quietly stopped running
 * shows as stale here even though it never logged an error.
 */

import { classify, type JobDef, type JobStatus } from "./classify.ts";

export type { JobDef, JobState, JobStatus } from "./classify.ts";

export const JOBS: JobDef[] = (registry as { jobs: JobDef[] }).jobs;

export async function loadJobStatuses(db: SupabaseClient, now = new Date()): Promise<JobStatus[]> {
  return Promise.all(
    JOBS.map(async (job) => {
      const [{ data: ok }, { data: last }] = await Promise.all([
        db
          .from("sync_log")
          .select("synced_at")
          .eq("source", job.source)
          .eq("status", "ok")
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("sync_log")
          .select("synced_at, status")
          .eq("source", job.source)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const lastOk = (ok?.synced_at as string | undefined) ?? null;
      const lastRun = last ? { at: last.synced_at as string, status: last.status as string } : null;
      return {
        ...job,
        state: classify(job, lastOk, lastRun, now),
        lastOk,
        lastRun: lastRun?.at ?? null,
        lastRunStatus: lastRun?.status ?? null,
      };
    }),
  );
}
