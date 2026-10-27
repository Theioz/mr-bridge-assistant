/**
 * Pure helpers behind the /jobs database tables: pill colours, view tabs, search, sort and short
 * dates. No React, so the node test runner can import it directly.
 */
import { FEEDBACK, FITS, STAGES, STATUSES, type JobRow, type Status } from "./jobs.ts";

/** Pill colour names; globals.css maps each `.jobs-pill[data-tone]` onto theme-aware colours. */
export type Tone = "gray" | "slate" | "yellow" | "orange" | "purple" | "green" | "red" | "muted";

export const STATUS_TONE: Record<Status, Tone> = {
  watching: "gray",
  to_apply: "slate",
  applied: "yellow",
  recruiter_screen: "orange",
  interviewing: "purple",
  offer: "green",
  rejected: "red",
  withdrawn: "muted",
  closed: "muted",
};
export const FIT_TONE: Record<(typeof FITS)[number], Tone> = {
  high: "green",
  medium: "yellow",
  low: "gray",
};
export const FEEDBACK_TONE: Record<(typeof FEEDBACK)[number], Tone> = {
  want: "green",
  not_for_me: "red",
  wrong_reason: "purple",
};
export const STAGE_TONE: Record<(typeof STAGES)[number], Tone> = {
  prefilter: "muted",
  pending: "slate",
  title_triage: "gray",
  scored: "orange",
  pay: "yellow",
  recommended: "green",
};

const CLOSED: Status[] = ["rejected", "withdrawn", "closed"];

/** The tracker's view tabs, Notion-style. "Interviewing" covers every stage past applying. */
export const TRACKER_TABS = [
  { key: "open", label: "Open", match: (s: Status | null) => !!s && !CLOSED.includes(s) },
  { key: "to_apply", label: "To apply", match: (s: Status | null) => s === "to_apply" },
  { key: "applied", label: "Applied", match: (s: Status | null) => s === "applied" },
  {
    key: "interviewing",
    label: "Interviewing",
    match: (s: Status | null) => s === "recruiter_screen" || s === "interviewing" || s === "offer",
  },
  { key: "rejected", label: "Rejected", match: (s: Status | null) => s === "rejected" },
  { key: "all", label: "All", match: () => true },
] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number]["key"];

export function tabCounts(rows: Pick<JobRow, "status">[]): Record<TrackerTab, number> {
  const out = Object.fromEntries(TRACKER_TABS.map((t) => [t.key, 0])) as Record<TrackerTab, number>;
  for (const r of rows) for (const t of TRACKER_TABS) if (t.match(r.status)) out[t.key]++;
  return out;
}

export function inTab<T extends Pick<JobRow, "status">>(rows: T[], tab: TrackerTab): T[] {
  const t = TRACKER_TABS.find((x) => x.key === tab) ?? TRACKER_TABS[0];
  return rows.filter((r) => t.match(r.status));
}

/** Case-insensitive substring match over the given fields; every word must hit some field. */
export function searchRows<T>(rows: T[], q: string, fields: (keyof T)[]): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = fields
      .map((f) => r[f])
      .filter((v) => typeof v === "string")
      .join("\n")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;

/** Stable sort; blanks always last whichever the direction. Strings compare case-insensitively. */
export function sortRows<T>(rows: T[], get: (r: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const ab = a.v == null || a.v === "";
      const bb = b.v == null || b.v === "";
      if (ab || bb) return ab === bb ? a.i - b.i : ab ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: "base" });
      return c ? c * sign : a.i - b.i;
    })
    .map((x) => x.r);
}

/** Status sorts in pipeline order, not alphabetically. */
export function statusRank(s: Status | null): number | null {
  return s ? STATUSES.indexOf(s) : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-27" -> "Oct 27" (this year) or "Oct 27, 2025". Blank stays blank. */
export function shortDate(d: string | null | undefined, today: string): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return "";
  const [y, m, day] = [d.slice(0, 4), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
  const md = `${MONTHS[m - 1]} ${day}`;
  return y === today.slice(0, 4) ? md : `${md}, ${y}`;
}
