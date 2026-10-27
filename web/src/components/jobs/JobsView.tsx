import {
  OPEN_STATUSES,
  STALE_DAYS,
  STATUS_LABEL,
  trackerSummary,
  type JobRow,
  type Stage,
} from "@/lib/jobs/jobs";
import { STATUS_TONE } from "@/lib/jobs/table";
import { Pill } from "@/components/jobs/PillSelect";
import { ReportView } from "@/components/jobs/ReportView";
import { TrackerTable } from "@/components/jobs/TrackerTable";
import { FilteredTable } from "@/components/jobs/FilteredTable";

export type JobsViewProps = {
  today: string;
  loadError: string | null;
  tracker: JobRow[];
  reportDates: string[];
  report: { date: string; markdown: string } | null;
  filtered: JobRow[];
  filteredCount: number;
  filteredLimit: number;
  filters: {
    stage: Stage | null;
    company: string | null;
    q: string | null;
    showStale: boolean;
    feedbackOnly: boolean;
    report: string | null;
  };
  byStage: Record<string, number>;
  companies: string[];
  lastCollect: string;
};

/**
 * The /jobs page body, from already-loaded data (the page does the queries): a one-line stat
 * strip, the Job Scout report (open when it is today's), the tracker table and the filtered table.
 */
export function JobsView(p: JobsViewProps) {
  const summary = trackerSummary(p.tracker, p.today);
  const behind = summary.appliedThisWeek < summary.target;
  const isToday = p.report?.date === p.today;

  return (
    <div style={{ maxWidth: "80rem", minWidth: 0 }}>
      <h1
        className="font-heading font-semibold"
        style={{ fontSize: "var(--t-h1)", color: "var(--color-text)" }}
      >
        Jobs
      </h1>
      {p.loadError ? (
        <p role="alert" style={{ ...strip, color: "var(--color-danger)" }}>
          Could not load jobs: {p.loadError}
        </p>
      ) : (
        <div style={strip}>
          <span style={{ color: behind ? "var(--color-amber)" : "var(--color-text)" }}>
            Applied this week{" "}
            <strong>
              {summary.appliedThisWeek} / {summary.target}
            </strong>
          </span>
          {OPEN_STATUSES.filter((s) => summary.open[s]).map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Pill label={STATUS_LABEL[s]} tone={STATUS_TONE[s]} /> {summary.open[s]}
            </span>
          ))}
          {p.lastCollect && <span className="jobs-faint">Collected {p.lastCollect}</span>}
        </div>
      )}

      <details open={isToday} style={{ margin: "var(--space-4) 0 var(--space-5)" }}>
        <summary style={summaryStyle}>
          <span className="font-heading" style={h2}>
            {isToday ? "Today's report" : "Report"}
          </span>
          <span className="jobs-faint" style={{ fontSize: "var(--t-micro)" }}>
            {p.report ? p.report.date : "none yet"}
          </span>
        </summary>
        {p.reportDates.length > 1 && (
          <form
            method="get"
            style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-2) 0" }}
          >
            <select
              name="report"
              aria-label="Report date"
              defaultValue={p.report?.date ?? ""}
              className="jobs-search"
            >
              {p.reportDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button type="submit" className="jobs-btn">
              Show
            </button>
          </form>
        )}
        {p.report ? (
          <ReportView markdown={p.report.markdown} />
        ) : (
          <p className="jobs-faint" style={{ fontSize: "var(--t-micro)" }}>
            No reports yet. Job Scout writes one each weekday morning.
          </p>
        )}
      </details>

      <section aria-labelledby="tracker-h" style={{ marginBottom: "var(--space-6)" }}>
        <h2 id="tracker-h" className="font-heading" style={h2}>
          Tracker
        </h2>
        <TrackerTable jobs={p.tracker} today={p.today} />
      </section>

      <section aria-labelledby="filtered-h">
        <h2 id="filtered-h" className="font-heading" style={h2}>
          Filtered out
        </h2>
        <p
          className="jobs-faint"
          style={{ fontSize: "var(--t-micro)", margin: "0 0 var(--space-2)" }}
        >
          Roles Job Scout saw but did not recommend. Want this puts one in the tracker in the next
          morning run. {p.filteredCount} matching
          {p.filteredCount > p.filteredLimit ? `, showing the newest ${p.filteredLimit}` : ""}.
        </p>
        <FilteredTable
          jobs={p.filtered}
          filters={p.filters}
          byStage={p.byStage}
          companies={p.companies}
          staleDays={STALE_DAYS}
          today={p.today}
        />
      </section>
    </div>
  );
}

const strip: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-1) var(--space-4)",
  marginTop: "var(--space-1)",
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};
const h2: React.CSSProperties = {
  fontSize: "var(--t-h2)",
  fontWeight: 600,
  color: "var(--color-text)",
  margin: "0 0 var(--space-2)",
};
const summaryStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--space-2)",
  minHeight: 40,
  cursor: "pointer",
};
