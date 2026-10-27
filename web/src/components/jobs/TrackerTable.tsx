"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import type { JobRow, Status } from "@/lib/jobs/jobs";
import {
  inTab,
  searchRows,
  shortDate,
  statusRank,
  tabCounts,
  TRACKER_TABS,
  type TrackerTab,
} from "@/lib/jobs/table";
import { DataTable, type Column } from "@/components/jobs/DataTable";
import { PillSelect } from "@/components/jobs/PillSelect";
import { FIT_OPTIONS, JobPeek, STATUS_OPTIONS, type PeekTarget } from "@/components/jobs/JobPeek";

/** Shared by both tables: keep server rows in local state so pill edits show at once. */
export function useJobRows(initial: JobRow[]) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [peek, setPeek] = useState<PeekTarget>(null);
  const [error, setError] = useState<string | null>(null);
  // Fresh server rows (after router.refresh) replace the local copy.
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setRows(initial);
  }

  function saved(job: JobRow) {
    setRows((rs) =>
      rs.some((r) => r.id === job.id) ? rs.map((r) => (r.id === job.id ? job : r)) : [job, ...rs],
    );
    setPeek((p) => (p?.kind === "job" && p.job.id === job.id ? { kind: "job", job } : p));
    router.refresh();
  }

  async function patch(job: JobRow, body: Record<string, unknown>) {
    setError(null);
    setRows((rs) => rs.map((r) => (r.id === job.id ? ({ ...r, ...body } as JobRow) : r)));
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      saved(data.job as JobRow);
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === job.id ? job : r)));
      setError((e as Error).message);
    }
  }

  return { rows, peek, setPeek, saved, patch, error };
}

/** The posting's ↗ link. (No Notion link: imported Notion page urls do not open.) */
export function LinkIcons({ job }: { job: Pick<JobRow, "url"> }) {
  if (!job.url) return null;
  return (
    <a
      className="jobs-link"
      href={job.url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open posting"
      title="Posting"
    >
      <ExternalLink size={14} aria-hidden />
    </a>
  );
}

export function SaveError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--t-micro)" }}>
      Not saved: {error}
    </p>
  );
}

/**
 * The application tracker as a Notion-style database view: view tabs with counts, a search over
 * role/company/notes, "+ New", sortable columns, status and fit pills editable in place, and a
 * side peek for everything else.
 */
export function TrackerTable({ jobs, today }: { jobs: JobRow[]; today: string }) {
  const { rows, peek, setPeek, saved, patch, error } = useJobRows(jobs);
  const [tab, setTab] = useState<TrackerTab>("open");
  const [q, setQ] = useState("");
  const counts = useMemo(() => tabCounts(rows), [rows]);
  const shown = useMemo(
    () => searchRows(inTab(rows, tab), q, ["title", "company", "notes"]),
    [rows, tab, q],
  );

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
      key: "status",
      label: "Status",
      width: "9.5rem",
      sortValue: (r) => statusRank(r.status),
      render: (r) => (
        <PillSelect
          label={`Status for ${r.title}`}
          value={r.status}
          options={STATUS_OPTIONS}
          onChange={(v) => void patch(r, { status: v as Status | null })}
          clearLabel="Remove from tracker"
        />
      ),
    },
    {
      key: "fit",
      label: "Fit",
      width: "6rem",
      sortValue: (r) => (r.fit ? ["high", "medium", "low"].indexOf(r.fit) : null),
      render: (r) => (
        <PillSelect
          label={`Fit for ${r.title}`}
          value={r.fit}
          options={FIT_OPTIONS}
          onChange={(v) => void patch(r, { fit: v })}
          emptyLabel=""
          clearLabel="Clear"
        />
      ),
    },
    {
      key: "level",
      label: "Level",
      width: "7.5rem",
      sortValue: (r) => r.level,
      title: (r) => r.level ?? undefined,
      render: (r) => r.level,
    },
    {
      key: "applied",
      label: "Applied",
      width: "6rem",
      sortValue: (r) => r.date_applied,
      render: (r) => shortDate(r.date_applied, today),
    },
    {
      key: "pay",
      label: "Pay",
      width: "8rem",
      sortValue: (r) => r.base_range,
      title: (r) => r.base_range ?? undefined,
      render: (r) => r.base_range,
    },
    {
      key: "location",
      label: "Location",
      width: "9rem",
      sortValue: (r) => r.location,
      title: (r) => r.location ?? undefined,
      render: (r) => r.location,
    },
    { key: "links", label: "Link", width: "3.5rem", render: (r) => <LinkIcons job={r} /> },
  ];

  return (
    <div>
      <div className="jobs-viewbar">
        <div className="jobs-tabs" role="tablist" aria-label="Tracker views">
          {TRACKER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="jobs-tab"
              onClick={() => setTab(t.key)}
            >
              {t.label} <span className="jobs-tab-count">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="jobs-tools">
          <input
            type="search"
            className="jobs-search"
            placeholder="Search"
            aria-label="Search role, company or notes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="jobs-btn"
            data-primary=""
            onClick={() => setPeek({ kind: "new" })}
          >
            <Plus size={14} aria-hidden /> New
          </button>
        </div>
      </div>
      <SaveError error={error} />
      <DataTable
        rows={shown}
        columns={columns}
        label="Application tracker"
        empty={q ? "No roles match." : "Nothing here."}
        rowLabel={(r) => `${r.title}, ${r.company}`}
        onOpen={(job) => setPeek({ kind: "job", job })}
      />
      <JobPeek target={peek} onClose={() => setPeek(null)} onSaved={saved} />
    </div>
  );
}
