/**
 * Jobs: the application tracker and Job Scout's pipeline, one `jobs` row per role (see the
 * migration 20261027120000_jobs.sql for the two lifecycles). Pure logic only — validation, filters,
 * week math and the report markdown parser — so it is unit-tested without a database.
 *
 * Scout rows are written by the homelab (`scripts/job_scout.py collect` / `ingest`); the app writes
 * Jason's feedback, the tracker fields, and manual adds. Feedback reaches the ranking agent through
 * the next morning's inbox: collect sends every row whose `feedback_sent_at` is null, so saving
 * feedback clears it.
 */

export const FEEDBACK = ["want", "not_for_me", "wrong_reason"] as const;
export type Feedback = (typeof FEEDBACK)[number];
export const FEEDBACK_LABEL: Record<Feedback, string> = {
  want: "Want this",
  not_for_me: "Not for me",
  wrong_reason: "Wrong reason",
};

export const STAGES = [
  "prefilter",
  "pending",
  "title_triage",
  "scored",
  "pay",
  "recommended",
] as const;
export type Stage = (typeof STAGES)[number];
/** Everything Job Scout did not recommend. `pending` = waiting for the agent. */
export const FILTERED_STAGES: Stage[] = ["pending", "title_triage", "scored", "pay", "prefilter"];
export const STAGE_LABEL: Record<Stage, string> = {
  prefilter: "Title / location rule",
  pending: "Awaiting review",
  title_triage: "Not shortlisted",
  scored: "Read, scored low",
  pay: "Pay below floor",
  recommended: "Recommended",
};

export const STATUSES = [
  "watching",
  "to_apply",
  "applied",
  "recruiter_screen",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  watching: "Watching",
  to_apply: "To apply",
  applied: "Applied",
  recruiter_screen: "Recruiter screen",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};
/** Still in play: what the "open pipeline" header counts. */
export const OPEN_STATUSES: Status[] = [
  "to_apply",
  "applied",
  "recruiter_screen",
  "interviewing",
  "offer",
];

export const FITS = ["high", "medium", "low"] as const;
export type Fit = (typeof FITS)[number];
export const LEVELS = ["TPM II", "TPM III", "Senior TPM", "Staff TPM", "Senior PM", "Manager"];

/** Weekly application target from the job-search plan. */
export const APPLY_TARGET_PER_WEEK = 8;
export const NOTE_MAX = 1000;
export const TEXT_MAX = 2000;
/** Postings not seen by collect for this many days are hidden by default (likely closed). */
export const STALE_DAYS = 7;

export type JobRow = {
  id: string;
  url: string | null;
  company: string;
  title: string;
  location: string | null;
  pay: string | null;
  source: "job_scout" | "manual" | "notion_import";
  stage: Stage | null;
  reason: string | null;
  score: number | null;
  first_seen: string | null;
  last_seen: string | null;
  feedback: Feedback | null;
  feedback_note: string | null;
  feedback_at: string | null;
  processed_at: string | null;
  status: Status | null;
  date_applied: string | null;
  date_rejected: string | null;
  fit: Fit | null;
  level: string | null;
  req_id: string | null;
  base_range: string | null;
  total_comp_est: string | null;
  notes: string | null;
  notion_page_url: string | null;
  updated_at: string;
};

export const JOB_COLUMNS =
  "id, url, company, title, location, pay, source, stage, reason, score, first_seen, last_seen, feedback, feedback_note, feedback_at, processed_at, status, date_applied, date_rejected, fit, level, req_id, base_range, total_comp_est, notes, notion_page_url, updated_at";

// ─────────────────────────────────────────────────────────────── validation

type Body = Record<string, unknown>;

function asObject(body: unknown): Body {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Body must be a JSON object");
  return body as Body;
}

function optText(v: unknown, field: string, max = TEXT_MAX): string | null {
  if (v == null) return null;
  if (typeof v !== "string") throw new Error(`${field} must be text`);
  return v.trim().slice(0, max) || null;
}

function optDate(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new Error(`${field} must be YYYY-MM-DD`);
  return v;
}

function optUrl(v: unknown, field = "url"): string | null {
  const s = optText(v, field, 1000);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) throw new Error(`${field} must start with http:// or https://`);
  return s.replace(/\/+$/, "");
}

export type FeedbackUpdate = {
  feedback: Feedback | null;
  feedback_note: string | null;
  feedback_at: string | null;
  feedback_sent_at: null;
  processed_at: null;
};

/**
 * `{ feedback, note? }` -> columns. `feedback: null` clears it. Any change re-queues the row for the
 * agent (feedback_sent_at -> null) and resets processed_at.
 */
export function feedbackUpdate(body: unknown, nowIso: string): FeedbackUpdate {
  const b = asObject(body);
  if (!("feedback" in b)) throw new Error("feedback is required (use null to clear)");
  const fb = b.feedback;
  if (fb !== null && !FEEDBACK.includes(fb as Feedback)) {
    throw new Error(`feedback must be one of ${FEEDBACK.join(", ")} or null`);
  }
  const note = optText(b.note, "note", NOTE_MAX);
  return {
    feedback: (fb as Feedback | null) ?? null,
    feedback_note: fb === null ? null : note,
    feedback_at: fb === null ? null : nowIso,
    feedback_sent_at: null,
    processed_at: null,
  };
}

const TRACKER_TEXT = [
  "level",
  "req_id",
  "base_range",
  "total_comp_est",
  "notes",
  "location",
  "company",
  "title",
] as const;

/**
 * Tracker edits from the page: only the fields present in the body change. Moving to applied or
 * rejected stamps today's date unless a date is given or the row already has one, so one tap on
 * a phone is enough to log an application.
 */
export function trackerPatch(
  body: unknown,
  existing: Pick<JobRow, "date_applied" | "date_rejected">,
  today: string,
): Record<string, unknown> {
  const b = asObject(body);
  const out: Record<string, unknown> = {};
  if ("status" in b) {
    if (b.status !== null && !STATUSES.includes(b.status as Status))
      throw new Error(`status must be one of ${STATUSES.join(", ")} or null`);
    out.status = b.status;
  }
  if ("fit" in b) {
    if (b.fit !== null && !FITS.includes(b.fit as Fit))
      throw new Error("fit must be high, medium or low");
    out.fit = b.fit;
  }
  for (const k of TRACKER_TEXT) {
    if (k in b) {
      out[k] = optText(b[k], k);
      if ((k === "company" || k === "title") && !out[k]) throw new Error(`${k} cannot be blank`);
    }
  }
  if ("url" in b) out.url = optUrl(b.url);
  if ("notion_page_url" in b) out.notion_page_url = optUrl(b.notion_page_url, "notion_page_url");
  if ("date_applied" in b) out.date_applied = optDate(b.date_applied, "date_applied");
  if ("date_rejected" in b) out.date_rejected = optDate(b.date_rejected, "date_rejected");

  if (out.status === "applied" && !("date_applied" in b) && !existing.date_applied)
    out.date_applied = today;
  if (out.status === "rejected" && !("date_rejected" in b) && !existing.date_rejected)
    out.date_rejected = today;
  if (Object.keys(out).length === 0) throw new Error("Nothing to update");
  return out;
}

/** A role added by hand on the page. Company and title are required; status defaults to to_apply. */
export function newJob(body: unknown, today: string): Record<string, unknown> {
  const b = asObject(body);
  const status = (b.status ?? "to_apply") as Status;
  const row = trackerPatch(
    { ...b, status, company: b.company ?? "", title: b.title ?? "" },
    { date_applied: null, date_rejected: null },
    today,
  );
  return { ...row, source: "manual" };
}

// ─────────────────────────────────────────────────────────────── filters + dates

/** Filtered-roles section filters, from the query string. */
export function parseFilters(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) =>
    (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const stage = one("stage");
  const report = one("report");
  return {
    stage: (FILTERED_STAGES as string[]).includes(stage) ? (stage as Stage) : null,
    company: one("company").slice(0, 100) || null,
    q: one("q").trim().slice(0, 100) || null,
    showStale: one("all") === "1",
    feedbackOnly: one("fb") === "1",
    report: /^\d{4}-\d{2}-\d{2}$/.test(report) ? report : null,
  };
}

/** YYYY-MM-DD `days` before `today` (YYYY-MM-DD), in plain calendar arithmetic. */
export function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Monday of `today`'s week (YYYY-MM-DD). */
export function weekStart(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return daysBefore(today, (dow + 6) % 7);
}

/** Header numbers: applications this week vs the target, and the open pipeline by status. */
export function trackerSummary(
  rows: Pick<JobRow, "status" | "date_applied">[],
  today: string,
): {
  appliedThisWeek: number;
  target: number;
  open: Partial<Record<Status, number>>;
} {
  const monday = weekStart(today);
  const open: Partial<Record<Status, number>> = {};
  let appliedThisWeek = 0;
  for (const r of rows) {
    if (r.date_applied && r.date_applied >= monday && r.date_applied <= today) appliedThisWeek++;
    if (r.status && OPEN_STATUSES.includes(r.status)) open[r.status] = (open[r.status] ?? 0) + 1;
  }
  return { appliedThisWeek, target: APPLY_TARGET_PER_WEEK, open };
}

/** Where a filtered role's feedback is with the agent. */
export function feedbackStatus(r: Pick<JobRow, "feedback" | "processed_at" | "status">) {
  if (!r.feedback) return null;
  if (!r.processed_at) return "Queued for tomorrow's run";
  if (r.feedback === "want") return r.status ? "Added to tracker" : "Processed";
  return "Noted";
}

// ─────────────────────────────────────────────────────────────── report markdown

export type Inline = { t: "text" | "b"; s: string } | { t: "a"; s: string; href: string };
export type Block =
  | { type: "h1" | "h2" | "h3" | "p"; inl: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] };

/**
 * The subset of markdown the Job Scout report uses: #/##/### headings, paragraphs, - / * lists,
 * pipe tables, **bold** and [links](https://…). Returned as data so the page renders it with React
 * elements — the report is agent-written text and is never injected as HTML. Only http(s) links
 * become links; anything else stays text.
 */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inl: inline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: (["h1", "h2", "h3"] as const)[h[1].length - 1], inl: inline(h[2]) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*]\s+/, "")));
        i++;
      }
      i--;
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const raw: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) raw.push(lines[i++]);
      i--;
      const cells = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => inline(c.trim()));
      const body = raw.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
      blocks.push({ type: "table", head: cells(body[0] ?? ""), rows: body.slice(1).map(cells) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: "text", s: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", s: m[1] });
    else out.push({ t: "a", s: m[2], href: m[3] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", s: s.slice(last) });
  return out;
}
