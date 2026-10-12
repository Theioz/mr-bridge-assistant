/**
 * Pure job-state classification for the Status page (#761). Kept free of runtime imports so the
 * bundler-free test runner can load it; the registry and loader live in jobs.ts.
 */

export interface JobDef {
  source: string;
  label: string;
  schedule: string;
  maxAgeHours: number;
}

export type JobState = "ok" | "failing" | "stale" | "never";

export interface JobStatus extends JobDef {
  state: JobState;
  lastOk: string | null;
  lastRun: string | null;
  lastRunStatus: string | null;
}

/** Pure: classify one job from its last success, its last run, and the current time. */
export function classify(
  job: JobDef,
  lastOk: string | null,
  lastRun: { at: string; status: string } | null,
  now: Date,
): JobState {
  if (!lastRun && !lastOk) return "never";
  if (!lastOk || now.getTime() - Date.parse(lastOk) > job.maxAgeHours * 3_600_000) return "stale";
  // Succeeded recently, but the most recent run failed: say so before it has a chance to go stale.
  if (lastRun && lastRun.status !== "ok" && Date.parse(lastRun.at) > Date.parse(lastOk)) {
    return "failing";
  }
  return "ok";
}
