"use client";

import {
  FEEDBACK_LABEL,
  FILTERED_STAGES,
  STAGE_LABEL,
  type Feedback,
  type JobRow,
  type Stage,
} from "@/lib/jobs/jobs";
import { shortDate, STAGE_TONE } from "@/lib/jobs/table";
import { DataTable, type Column } from "@/components/jobs/DataTable";
import { Pill, PillSelect } from "@/components/jobs/PillSelect";
import { FEEDBACK_OPTIONS, JobPeek } from "@/components/jobs/JobPeek";
import { LinkIcons, SaveError, useJobRows } from "@/components/jobs/TrackerTable";

type Filters = {
  stage: Stage | null;
  company: string | null;
  q: string | null;
  showStale: boolean;
  feedbackOnly: boolean;
  report: string | null;
};

/** Query string for the filtered view with some filters changed. */
function href(f: Filters, change: Partial<Filters>): string {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.report) p.set("report", n.report);
  if (n.stage) p.set("stage", n.stage);
  if (n.company) p.set("company", n.company);
  if (n.q) p.set("q", n.q);
  if (n.showStale) p.set("all", "1");
  if (n.feedbackOnly) p.set("fb", "1");
  const s = p.toString();
  return `?${s}#filtered-h`;
}

/**
 * Every role Job Scout saw but did not recommend, as the same database table as the tracker.
 * Filtering stays server-side (it can be thousands of rows): stage tabs are links, company /
 * title / toggles are one small GET form. Feedback is a pill; its note lives in the peek.
 */
export function FilteredTable({
  jobs,
  filters,
  byStage,
  companies,
  staleDays,
  today,
}: {
  jobs: JobRow[];
  filters: Filters;
  byStage: Record<string, number>;
  companies: string[];
  staleDays: number;
  today: string;
}) {
  const { rows, peek, setPeek, saved, patch, error } = useJobRows(jobs);
  const total = FILTERED_STAGES.reduce((n, s) => n + (byStage[s] ?? 0), 0);

  const columns: Column<JobRow>[] = [
    {
      key: "title",
      label: "Role",
      width: "min(17rem, 46vw)",
      sticky: true,
      sortValue: (r) => r.title,
      title: (r) => r.title,
      render: (r) => <span className="jobs-primary">{r.title}</span>,
    },
    {
      key: "company",
      label: "Company",
      width: "9rem",
      sortValue: (r) => r.company,
      title: (r) => r.company,
      render: (r) => r.company,
    },
    {
      key: "stage",
      label: "Stage",
      width: "8rem",
      sortValue: (r) => (r.stage ? STAGE_LABEL[r.stage] : null),
      render: (r) => r.stage && <Pill label={STAGE_LABEL[r.stage]} tone={STAGE_TONE[r.stage]} />,
    },
    {
      key: "reason",
      label: "Reason",
      width: "18rem",
      sortValue: (r) => r.reason,
      title: (r) => r.reason ?? undefined,
      render: (r) => <span className="jobs-faint">{r.reason}</span>,
    },
    {
      key: "score",
      label: "Score",
      width: "4.5rem",
      sortValue: (r) => r.score,
      render: (r) => (r.score != null ? `${r.score}/10` : ""),
    },
    {
      key: "location",
      label: "Location",
      width: "9rem",
      sortValue: (r) => r.location,
      title: (r) => r.location ?? undefined,
      render: (r) => r.location,
    },
    {
      key: "first_seen",
      label: "First seen",
      width: "6rem",
      sortValue: (r) => r.first_seen,
      render: (r) => shortDate(r.first_seen, today),
    },
    {
      key: "feedback",
      label: "Feedback",
      width: "8.5rem",
      sortValue: (r) => (r.feedback ? FEEDBACK_LABEL[r.feedback] : null),
      render: (r) => (
        <PillSelect
          label={`Feedback on ${r.title}`}
          value={r.feedback}
          options={FEEDBACK_OPTIONS}
          onChange={(v) =>
            void patch(r, {
              feedback: v as Feedback | null,
              note: v ? (r.feedback_note ?? "") : "",
            })
          }
          emptyLabel=""
          clearLabel="Clear feedback"
        />
      ),
    },
    { key: "links", label: "Link", width: "3.5rem", render: (r) => <LinkIcons job={r} /> },
  ];

  return (
    <div>
      <div className="jobs-viewbar">
        <nav className="jobs-tabs" aria-label="Filtered stages">
          <a
            className="jobs-tab"
            href={href(filters, { stage: null })}
            aria-current={!filters.stage ? "page" : undefined}
          >
            All <span className="jobs-tab-count">{total}</span>
          </a>
          {FILTERED_STAGES.map((s) => (
            <a
              key={s}
              className="jobs-tab"
              href={href(filters, { stage: s })}
              aria-current={filters.stage === s ? "page" : undefined}
            >
              {STAGE_LABEL[s]} <span className="jobs-tab-count">{byStage[s] ?? 0}</span>
            </a>
          ))}
        </nav>
      </div>
      <form
        method="get"
        action="#filtered-h"
        className="jobs-tools"
        style={{ flexWrap: "wrap", marginLeft: 0, padding: "var(--space-2) 0" }}
      >
        {filters.report && <input type="hidden" name="report" value={filters.report} />}
        {filters.stage && <input type="hidden" name="stage" value={filters.stage} />}
        <input
          type="search"
          name="q"
          className="jobs-search"
          placeholder="Title contains"
          aria-label="Title contains"
          defaultValue={filters.q ?? ""}
        />
        <select
          name="company"
          className="jobs-search"
          aria-label="Company"
          defaultValue={filters.company ?? ""}
          style={{ width: "11rem" }}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="jobs-tab" style={{ cursor: "pointer" }}>
          <input type="checkbox" name="all" value="1" defaultChecked={filters.showStale} />
          Include not seen in {staleDays} days
        </label>
        <label className="jobs-tab" style={{ cursor: "pointer" }}>
          <input type="checkbox" name="fb" value="1" defaultChecked={filters.feedbackOnly} />
          With feedback
        </label>
        <button type="submit" className="jobs-btn">
          Apply
        </button>
      </form>
      <SaveError error={error} />
      <DataTable
        rows={rows}
        columns={columns}
        label="Roles Job Scout filtered out"
        empty="No filtered roles match."
        rowLabel={(r) => `${r.title}, ${r.company}`}
        onOpen={(job) => setPeek({ kind: "job", job })}
      />
      <JobPeek target={peek} onClose={() => setPeek(null)} onSaved={saved} />
    </div>
  );
}
