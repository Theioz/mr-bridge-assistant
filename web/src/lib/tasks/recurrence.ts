/**
 * Recurring-task series helpers (#468).
 *
 * The occurrence GENERATION lives in Python (scripts/_recurrence.py) because the spawner is a cron
 * job — this side only ever has to describe a series and validate a form, never materialize dates.
 * Keep `cadenceLabel` in step with `describe_cadence()` there: the ntfy body and the task row
 * should not describe the same series differently.
 */

export const FREQS = ["daily", "weekly", "monthly"] as const;
export type Freq = (typeof FREQS)[number];

/** 0=Sun … 6=Sat — matches Postgres extract(dow) and Date.getDay(), so neither side remaps. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export interface CadenceInput {
  freq: Freq;
  interval: number;
  byweekday?: number[] | null;
  ends_on?: string | null;
}

/** Human phrasing, e.g. "every Sunday", "every 3 days", "every Mon, Thu". */
export function cadenceLabel({ freq, interval, byweekday }: CadenceInput): string {
  const n = Math.max(1, Math.trunc(interval || 1));
  if (freq === "daily") return n === 1 ? "every day" : `every ${n} days`;

  if (freq === "weekly") {
    const days = [...new Set(byweekday ?? [])].sort((a, b) => a - b);
    if (n === 1 && days.length === 1) return `every ${WEEKDAY_NAMES[days[0]]}`;
    if (n === 1 && days.length > 1)
      return `every ${days.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ")}`;
    if (n === 1) return "every week";
    const base = `every ${n} weeks`;
    return days.length
      ? `${base} on ${days.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ")}`
      : base;
  }

  return n === 1 ? "every month" : `every ${n} months`;
}

/** Cadence plus its end date, e.g. "every Sunday until 2026-12-31". */
export function cadenceLabelWithEnd(input: CadenceInput): string {
  const base = cadenceLabel(input);
  return input.ends_on ? `${base} until ${input.ends_on}` : base;
}

/** Whole days from today to `ends_on`, or null for an open-ended series. Negative = already past. */
export function daysUntilEnd(ends_on: string | null | undefined, today: string): number | null {
  if (!ends_on) return null;
  const a = new Date(`${ends_on}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/**
 * Warning runway before expiry — mirrors warning_days() in scripts/check_series_expiring.py.
 * At least 14 days, more for a sparse cadence: a weekly series gives you fewer chances to notice
 * than a daily one.
 */
export function warningDays(freq: Freq, interval: number): number {
  const perUnit = freq === "monthly" ? 30 : freq === "weekly" ? 7 : 1;
  return Math.max(14, 3 * perUnit * Math.max(1, Math.trunc(interval || 1)));
}

/** True when a series is inside its warning runway and hasn't been dismissed. */
export function isExpiringSoon(
  series: {
    freq: Freq;
    interval: number;
    ends_on: string | null;
    expiry_dismissed_at: string | null;
  },
  today: string,
): boolean {
  if (series.expiry_dismissed_at) return false;
  const left = daysUntilEnd(series.ends_on, today);
  if (left === null || left < 0) return false;
  return left <= warningDays(series.freq, series.interval);
}

/** Add whole months, clamping to month end — Jan 31 + 1 month is Feb 28, not Mar 3. */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

export interface SeriesDraft {
  freq: Freq;
  interval: number;
  byweekday: number[];
  starts_on: string;
  ends_on: string | null;
}

/** Validate a series before it reaches the database. Returns an error string, or null if valid. */
export function validateSeries(d: SeriesDraft): string | null {
  if (!FREQS.includes(d.freq)) return `Unknown repeat frequency: ${d.freq}`;
  if (!Number.isInteger(d.interval) || d.interval < 1) return "Repeat interval must be 1 or more.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.starts_on)) return "Start date must be YYYY-MM-DD.";
  if (d.ends_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.ends_on)) return "End date must be YYYY-MM-DD.";
    if (d.ends_on < d.starts_on) return "End date must be on or after the start date.";
  }
  if (d.byweekday.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
    return "Weekdays must be 0 (Sunday) through 6 (Saturday).";
  return null;
}
