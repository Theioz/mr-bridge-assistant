"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FITS,
  LEVELS,
  STATUSES,
  STATUS_LABEL,
  type Fit,
  type JobRow,
  type Status,
} from "@/lib/jobs/jobs";
import {
  btnStyle,
  gridStyle,
  inputStyle,
  labelStyle,
  linksStyle,
  listStyle,
  mutedStyle,
  panelStyle,
  rowStyle,
  tagStyle,
} from "@/components/jobs/styles";

type Props = { jobs: JobRow[] };

/**
 * The application tracker. Status is a native select, so changing it is one tap on a phone; moving
 * to Applied or Rejected stamps today's date server-side when none is set. "Edit" opens fit, level,
 * dates, pay and notes for that one row.
 */
export function TrackerList({ jobs }: Props) {
  const [filter, setFilter] = useState<Status | "open" | "all">("open");
  const counts = useMemo(() => {
    const m: Partial<Record<Status, number>> = {};
    for (const j of jobs) if (j.status) m[j.status] = (m[j.status] ?? 0) + 1;
    return m;
  }, [jobs]);
  const shown = jobs.filter((j) =>
    filter === "all"
      ? true
      : filter === "open"
        ? !["rejected", "withdrawn", "closed"].includes(j.status ?? "")
        : j.status === filter,
  );

  return (
    <div>
      <div
        role="group"
        aria-label="Filter by status"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-1)",
          margin: "var(--space-2) 0",
        }}
      >
        {(["open", ...STATUSES, "all"] as const).map((s) => {
          const n = s === "open" ? undefined : s === "all" ? jobs.length : (counts[s] ?? 0);
          if (n === 0) return null;
          const on = filter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(s)}
              style={{
                ...btnStyle,
                borderColor: on ? "var(--color-primary)" : "var(--rule-soft)",
                color: on ? "var(--color-primary)" : "var(--color-text)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {s === "open" ? "Open" : s === "all" ? "All" : STATUS_LABEL[s]}
              {n !== undefined ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p style={mutedStyle}>Nothing here.</p>
      ) : (
        <ul style={listStyle}>
          {shown.map((j) => (
            <TrackerRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TrackerRow({ job }: { job: JobRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fit: job.fit ?? "",
    level: job.level ?? "",
    date_applied: job.date_applied ?? "",
    date_rejected: job.date_rejected ?? "",
    base_range: job.base_range ?? "",
    notes: job.notes ?? "",
  });

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const meta = [
    job.location,
    job.fit ? `${job.fit} fit` : null,
    job.level,
    job.date_applied ? `applied ${job.date_applied}` : null,
    job.date_rejected ? `rejected ${job.date_rejected}` : null,
    job.base_range || job.pay,
  ].filter(Boolean);

  return (
    <li style={rowStyle}>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--t-body)", color: "var(--color-text)" }}>
            {job.company} · {job.title}
            {job.score != null && (
              <span style={{ color: "var(--color-text-muted)" }}> · {job.score}/10</span>
            )}
          </div>
          <div style={mutedStyle}>{meta.join(" · ")}</div>
        </div>
        <label style={{ ...labelStyle, flexShrink: 0 }}>
          <span className="sr-only">Status</span>
          <select
            value={job.status ?? ""}
            disabled={busy}
            onChange={(e) => patch({ status: e.target.value || null })}
            style={inputStyle}
            aria-label={`Status for ${job.company} ${job.title}`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="">Remove from tracker</option>
          </select>
        </label>
      </div>
      {job.reason && job.stage === "recommended" && (
        <p style={{ ...mutedStyle, margin: "var(--space-1) 0 0" }}>
          <span style={tagStyle}>Job Scout</span> {job.reason}
        </p>
      )}
      {job.notes && !editing && (
        <p style={{ ...mutedStyle, margin: "var(--space-1) 0 0", whiteSpace: "pre-line" }}>
          {job.notes.length > 280 ? `${job.notes.slice(0, 280)}…` : job.notes}
        </p>
      )}
      <div style={linksStyle}>
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer">
            Posting
          </a>
        )}
        {job.notion_page_url && (
          <a href={job.notion_page_url} target="_blank" rel="noreferrer">
            Notion
          </a>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={{ ...btnStyle, minHeight: 32, padding: "0 var(--space-2)" }}
          aria-expanded={editing}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void patch({
              fit: (form.fit || null) as Fit | null,
              level: form.level,
              date_applied: form.date_applied || null,
              date_rejected: form.date_rejected || null,
              base_range: form.base_range,
              notes: form.notes,
            });
          }}
          style={{ ...panelStyle, marginTop: "var(--space-2)" }}
        >
          <div style={{ ...gridStyle, margin: 0 }}>
            <label style={labelStyle}>
              Fit
              <select
                value={form.fit}
                onChange={(e) => setForm({ ...form, fit: e.target.value })}
                style={inputStyle}
              >
                <option value="">—</option>
                {FITS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Level
              <input
                list="job-levels"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Applied
              <input
                type="date"
                value={form.date_applied}
                onChange={(e) => setForm({ ...form, date_applied: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Rejected
              <input
                type="date"
                value={form.date_rejected}
                onChange={(e) => setForm({ ...form, date_rejected: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Base range
              <input
                value={form.base_range}
                onChange={(e) => setForm({ ...form, base_range: e.target.value })}
                style={inputStyle}
              />
            </label>
          </div>
          <label style={{ ...labelStyle, marginTop: "var(--space-2)" }}>
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              style={{ ...inputStyle, padding: "var(--space-2)" }}
            />
          </label>
          <datalist id="job-levels">
            {LEVELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={busy}
            style={{ ...btnStyle, marginTop: "var(--space-2)" }}
          >
            Save
          </button>
        </form>
      )}
      {error && (
        <p role="alert" style={{ ...mutedStyle, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
