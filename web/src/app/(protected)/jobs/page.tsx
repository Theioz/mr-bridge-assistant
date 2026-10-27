export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import { AddJobForm } from "@/components/jobs/AddJobForm";
import { FeedbackControls } from "@/components/jobs/FeedbackControls";
import { ReportView } from "@/components/jobs/ReportView";
import { TrackerList } from "@/components/jobs/TrackerList";
import {
  btnStyle,
  checkStyle,
  gridStyle,
  h2Style,
  inputStyle,
  labelStyle,
  linksStyle,
  listStyle,
  mutedStyle,
  rowStyle,
  tagStyle,
} from "@/components/jobs/styles";
import {
  daysBefore,
  FILTERED_STAGES,
  JOB_COLUMNS,
  OPEN_STATUSES,
  parseFilters,
  STAGE_LABEL,
  STALE_DAYS,
  STATUS_LABEL,
  trackerSummary,
  type JobRow,
} from "@/lib/jobs/jobs";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Job Scout's daily report, the application tracker, and every role it filtered out.",
};

const FILTERED_LIMIT = 200;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";
  const today = todayString();
  const staleCutoff = daysBefore(today, STALE_DAYS);

  const [reportDates, tracker, scoutSummary] = await Promise.all([
    supabase
      .from("job_scout_reports")
      .select("date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60),
    supabase
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", userId)
      .not("status", "is", null)
      .order("updated_at", { ascending: false })
      .range(0, 4999),
    // Small columns only, for the scout counts and the company filter.
    supabase
      .from("jobs")
      .select("stage, company, last_seen")
      .eq("user_id", userId)
      .not("stage", "is", null)
      .is("status", null)
      .range(0, 9999),
  ]);

  const dates = (reportDates.data ?? []).map((r) => r.date as string);
  const reportDate = f.report && dates.includes(f.report) ? f.report : (dates[0] ?? null);
  const report = reportDate
    ? (
        await supabase
          .from("job_scout_reports")
          .select("date, markdown")
          .eq("user_id", userId)
          .eq("date", reportDate)
          .maybeSingle()
      ).data
    : null;

  let q = supabase
    .from("jobs")
    .select(JOB_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .is("status", null)
    .in("stage", f.stage ? [f.stage] : FILTERED_STAGES);
  if (f.company) q = q.eq("company", f.company);
  if (f.q) q = q.ilike("title", `%${f.q.replace(/[%_]/g, "")}%`);
  if (!f.showStale) q = q.gte("last_seen", staleCutoff);
  if (f.feedbackOnly) q = q.not("feedback", "is", null);
  const { data: filtered, count } = await q
    .order("first_seen", { ascending: false })
    .order("company")
    .limit(FILTERED_LIMIT);

  const jobs = (tracker.data ?? []) as JobRow[];
  const summary = trackerSummary(jobs, today);
  const scoutRows = scoutSummary.data ?? [];
  const lastCollect = scoutRows.reduce(
    (m, r) => (r.last_seen && r.last_seen > m ? r.last_seen : m),
    "",
  );
  const companies = [...new Set(scoutRows.map((r) => r.company as string))].sort((a, b) =>
    a.localeCompare(b),
  );
  const byStage = scoutRows.reduce<Record<string, number>>((m, r) => {
    if (r.stage) m[r.stage] = (m[r.stage] ?? 0) + 1;
    return m;
  }, {});
  const list = (filtered ?? []) as JobRow[];
  const loadError = tracker.error ?? scoutSummary.error ?? reportDates.error;
  const pipeline = OPEN_STATUSES.filter((s) => summary.open[s]).map(
    (s) => `${STATUS_LABEL[s]} ${summary.open[s]}`,
  );

  return (
    <div className="max-w-3xl">
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1
          className="font-heading font-semibold"
          style={{ fontSize: "var(--t-h1)", color: "var(--color-text)" }}
        >
          Jobs
        </h1>
        {loadError ? (
          <p className="mt-1" style={{ ...mutedStyle, color: "var(--color-danger)" }}>
            Could not load jobs: {loadError.message}
          </p>
        ) : (
          <>
            <p
              className="mt-1"
              style={{
                fontSize: "var(--t-body)",
                color:
                  summary.appliedThisWeek >= summary.target
                    ? "var(--color-text)"
                    : "var(--color-amber)",
              }}
            >
              Applied this week: {summary.appliedThisWeek} / {summary.target}
            </p>
            <p style={mutedStyle}>
              {pipeline.length ? `Open pipeline: ${pipeline.join(" · ")}` : "No open applications"}
              {lastCollect ? ` · last collected ${lastCollect}` : ""}
            </p>
          </>
        )}
      </div>

      <section aria-labelledby="report-h" style={{ marginBottom: "var(--space-6)" }}>
        <h2 id="report-h" className="font-heading" style={h2Style}>
          {reportDate === today ? "Today's report" : "Report"}
        </h2>
        {dates.length > 1 && (
          <form method="get" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <label style={labelStyle}>
              Date
              <select name="report" defaultValue={reportDate ?? ""} style={inputStyle}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" style={{ ...btnStyle, alignSelf: "flex-end" }}>
              Show
            </button>
          </form>
        )}
        {report ? (
          <>
            {reportDate !== today && (
              <p style={mutedStyle}>Report from {reportDate}. Today&apos;s run has not reported.</p>
            )}
            <ReportView markdown={report.markdown as string} />
          </>
        ) : (
          <p style={mutedStyle}>No reports yet. Job Scout writes one each weekday morning.</p>
        )}
      </section>

      <section aria-labelledby="tracker-h" style={{ marginBottom: "var(--space-6)" }}>
        <h2 id="tracker-h" className="font-heading" style={h2Style}>
          Tracker
        </h2>
        <AddJobForm />
        <TrackerList jobs={jobs} />
      </section>

      <section aria-labelledby="filtered-h">
        <h2 id="filtered-h" className="font-heading" style={h2Style}>
          Filtered out
        </h2>
        <p style={{ ...mutedStyle, marginTop: 0 }}>
          Every role Job Scout saw but did not recommend, and why. Want this adds it to the tracker
          in the next morning run; a note tells the agent why.
        </p>

        <form method="get" style={gridStyle}>
          {f.report && <input type="hidden" name="report" value={f.report} />}
          <label style={labelStyle}>
            Stage
            <select name="stage" defaultValue={f.stage ?? ""} style={inputStyle}>
              <option value="">All filtered</option>
              {FILTERED_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]} ({byStage[s] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Company
            <select name="company" defaultValue={f.company ?? ""} style={inputStyle}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Title contains
            <input name="q" defaultValue={f.q ?? ""} style={inputStyle} />
          </label>
          <label style={checkStyle}>
            <input type="checkbox" name="all" value="1" defaultChecked={f.showStale} />
            Include closed (not seen in {STALE_DAYS} days)
          </label>
          <label style={checkStyle}>
            <input type="checkbox" name="fb" value="1" defaultChecked={f.feedbackOnly} />
            Only ones I gave feedback on
          </label>
          <button type="submit" style={btnStyle}>
            Apply
          </button>
        </form>

        <p style={mutedStyle}>
          {count ?? list.length} matching
          {(count ?? 0) > FILTERED_LIMIT ? ` · showing newest ${FILTERED_LIMIT}` : ""}
        </p>
        <ul style={listStyle}>
          {list.map((r) => (
            <li key={r.id} style={rowStyle}>
              <div style={{ fontSize: "var(--t-body)", color: "var(--color-text)" }}>
                {r.company} · {r.title}
                {r.score != null && (
                  <span style={{ color: "var(--color-text-muted)" }}> · {r.score}/10</span>
                )}
              </div>
              <div style={mutedStyle}>
                {[r.location, r.pay || null, r.first_seen ? `first seen ${r.first_seen}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <p style={{ ...mutedStyle, margin: "var(--space-1) 0 0" }}>
                {r.stage && <span style={tagStyle}>{STAGE_LABEL[r.stage]}</span>} {r.reason}
              </p>
              {r.url && (
                <div style={linksStyle}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    Posting
                  </a>
                </div>
              )}
              <FeedbackControls role={r} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
