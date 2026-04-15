"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { WorkoutSession } from "@/lib/types";

interface Props {
  workouts: WorkoutSession[];
}

type SortKey = "date" | "activity" | "duration_mins" | "calories" | "avg_hr";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format HH:MM:SS → h:mm AM/PM */
function fmtTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Compute end time from HH:MM:SS start + duration in minutes, formatted as h:mm AM/PM */
function calcEndTime(startTime: string | null, durationMins: number | null): string {
  if (!startTime || durationMins == null) return "—";
  const [h, m] = startTime.split(":").map(Number);
  const totalMins = h * 60 + m + durationMins;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  const ampm = endH >= 12 ? "PM" : "AM";
  const h12 = endH % 12 || 12;
  return `${h12}:${String(endM).padStart(2, "0")} ${ampm}`;
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ opacity: 0.3 }} />;
  return dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
}

const SOURCE_COLORS: Record<string, string> = {
  fitbit: "var(--color-primary)",
  manual: "var(--color-text-muted)",
};

export function WorkoutHistoryTable({ workouts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [activityFilter, setActivityFilter] = useState<string>("All");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  // Unique activity types for the filter pills
  const activityTypes = ["All", ...Array.from(new Set(workouts.map((w) => w.activity))).sort()];

  const filtered =
    activityFilter === "All" ? workouts : workouts.filter((w) => w.activity === activityFilter);

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    paddingBottom: 10,
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-muted)",
    letterSpacing: "0.05em",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const thNoSort: React.CSSProperties = {
    ...thStyle,
    cursor: "default",
  };

  const tdBase: React.CSSProperties = {
    paddingTop: 10,
    paddingBottom: 4,
    borderTop: "1px solid var(--color-border)",
    fontSize: 13,
    color: "var(--color-text)",
    verticalAlign: "top",
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-4"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Workout History
      </p>

      {workouts.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-faint)", paddingTop: 8 }}>
          No workouts logged
        </p>
      ) : (
        <>
          {/* Activity type filter pills */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {activityTypes.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setActivityFilter(type);
                  setPage(0);
                }}
                className="px-2.5 py-1 rounded-full text-xs transition-colors duration-150 cursor-pointer"
                style={{
                  fontSize: 11,
                  fontWeight: activityFilter === type ? 600 : 400,
                  background:
                    activityFilter === type
                      ? "var(--color-primary)"
                      : "var(--color-surface-raised, rgba(255,255,255,0.05))",
                  color:
                    activityFilter === type
                      ? "#fff"
                      : "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  {([
                    { key: "date" as SortKey, label: "Date", sortable: true },
                    { key: "activity" as SortKey, label: "Activity", sortable: true },
                    { key: "duration_mins" as SortKey, label: "Duration", sortable: true },
                    { key: "calories" as SortKey, label: "Calories", sortable: true },
                    { key: "avg_hr" as SortKey, label: "Avg HR", sortable: true },
                  ] as { key: SortKey; label: string; sortable: boolean }[]).map(({ key, label, sortable }) => (
                    <th
                      key={key}
                      style={sortable ? thStyle : thNoSort}
                      onClick={sortable ? () => handleSort(key) : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {sortable && <SortIcon col={key} sortKey={sortKey} dir={sortDir} />}
                      </span>
                    </th>
                  ))}
                  <th style={thNoSort}>Start</th>
                  <th style={thNoSort}>End</th>
                  <th style={thNoSort}>Source</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((w, i) => {
                  const hrZones = w.metadata?.hr_zones;
                  return (
                    <tr key={i}>
                      <td style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        <div style={{ paddingBottom: hrZones ? 6 : 10 }}>{fmtDate(w.date)}</div>
                        {hrZones && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--color-text-faint, var(--color-text-muted))",
                              paddingBottom: 8,
                              paddingTop: 2,
                            }}
                          >
                            {hrZones}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdBase, fontWeight: 500, textTransform: "capitalize" }}>
                        <div style={{ paddingBottom: hrZones ? 6 : 10 }}>{w.activity ?? "—"}</div>
                        {hrZones && <div style={{ paddingBottom: 8, paddingTop: 2 }} />}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          color: "var(--color-text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          color: "var(--color-text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {w.calories != null ? `${w.calories}` : "—"}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          color: "var(--color-text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {w.avg_hr != null ? `${w.avg_hr} bpm` : "—"}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          color: "var(--color-text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtTime(w.start_time)}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          color: "var(--color-text-muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {calcEndTime(w.start_time, w.duration_mins)}
                      </td>
                      <td style={tdBase}>
                        {w.source ? (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: 10,
                              fontWeight: 500,
                              letterSpacing: "0.04em",
                              padding: "2px 7px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border)",
                              color: SOURCE_COLORS[w.source] ?? "var(--color-text-muted)",
                              textTransform: "lowercase",
                            }}
                          >
                            {w.source}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between mt-4 pt-3"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{" "}
                {sorted.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
