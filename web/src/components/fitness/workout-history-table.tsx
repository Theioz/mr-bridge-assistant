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

function fmtTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

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
    paddingBottom: "var(--space-3)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-faint)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const thNoSort: React.CSSProperties = { ...thStyle, cursor: "default" };

  const tdBase: React.CSSProperties = {
    paddingTop: "var(--space-3)",
    paddingBottom: "var(--space-2)",
    borderTop: "1px solid var(--rule-soft)",
    fontSize: "var(--t-micro)",
    color: "var(--color-text)",
    verticalAlign: "top",
  };

  return (
    <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "var(--t-h2)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Workout history
        </h2>
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          {workouts.length} total
        </span>
      </div>

      {workouts.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            fontStyle: "italic",
          }}
        >
          No workouts logged
        </p>
      ) : (
        <>
          <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
            {activityTypes.map((type) => {
              const active = activityFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    setActivityFilter(type);
                    setPage(0);
                  }}
                  className="cursor-pointer"
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    minHeight: 32,
                    padding: "0 var(--space-3)",
                    borderRadius: "var(--r-1)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
                    textTransform: "capitalize",
                    transition:
                      "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  {(
                    [
                      { key: "date" as SortKey, label: "Date", sortable: true },
                      { key: "activity" as SortKey, label: "Activity", sortable: true },
                      { key: "duration_mins" as SortKey, label: "Duration", sortable: true },
                      { key: "calories" as SortKey, label: "Calories", sortable: true },
                      { key: "avg_hr" as SortKey, label: "Avg HR", sortable: true },
                    ] as { key: SortKey; label: string; sortable: boolean }[]
                  ).map(({ key, label, sortable }) => (
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
                        <div
                          className="tnum"
                          style={{ paddingBottom: hrZones ? 6 : "var(--space-2)" }}
                        >
                          {fmtDate(w.date)}
                        </div>
                        {hrZones && (
                          <div
                            className="tnum"
                            style={{
                              fontSize: 11,
                              color: "var(--color-text-faint)",
                              paddingBottom: "var(--space-2)",
                              paddingTop: 2,
                            }}
                          >
                            {hrZones}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdBase,
                          fontWeight: 500,
                          textTransform: "capitalize",
                        }}
                      >
                        <div style={{ paddingBottom: hrZones ? 6 : "var(--space-2)" }}>
                          {w.activity ?? "—"}
                        </div>
                        {hrZones && (
                          <div style={{ paddingBottom: "var(--space-2)", paddingTop: 2 }} />
                        )}
                      </td>
                      <td className="tnum" style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                      </td>
                      <td className="tnum" style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        {w.calories != null ? `${w.calories}` : "—"}
                      </td>
                      <td className="tnum" style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        {w.avg_hr != null ? `${w.avg_hr} bpm` : "—"}
                      </td>
                      <td className="tnum" style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        {fmtTime(w.start_time)}
                      </td>
                      <td className="tnum" style={{ ...tdBase, color: "var(--color-text-muted)" }}>
                        {calcEndTime(w.start_time, w.duration_mins)}
                      </td>
                      <td style={tdBase}>
                        {w.source ? (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: 10,
                              fontWeight: 500,
                              letterSpacing: "0.08em",
                              padding: "2px 7px",
                              borderRadius: 999,
                              border: "1px solid var(--rule)",
                              color: "var(--color-text-muted)",
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

          {totalPages > 1 && (
            <div
              className="flex items-center justify-between flex-wrap"
              style={{
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--rule-soft)",
                gap: "var(--space-3)",
              }}
            >
              <span
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                }}
              >
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{" "}
                {sorted.length} · Page {page + 1} of {totalPages}
              </span>
              <div className="flex" style={{ gap: "var(--space-2)" }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{
                    minHeight: 44,
                    padding: "0 var(--space-3)",
                    borderRadius: "var(--r-1)",
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    color: "var(--color-text-muted)",
                    fontSize: "var(--t-micro)",
                    gap: 4,
                  }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{
                    minHeight: 44,
                    padding: "0 var(--space-3)",
                    borderRadius: "var(--r-1)",
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    color: "var(--color-text-muted)",
                    fontSize: "var(--t-micro)",
                    gap: 4,
                  }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
