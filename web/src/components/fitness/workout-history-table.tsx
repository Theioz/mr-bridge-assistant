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

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ opacity: 0.3 }} />;
  return dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
}

export function WorkoutHistoryTable({ workouts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  const sorted = [...workouts].sort((a, b) => {
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

  const tdBase: React.CSSProperties = {
    paddingTop: 10,
    paddingBottom: 10,
    borderTop: "1px solid var(--color-border)",
    fontSize: 13,
    color: "var(--color-text)",
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Workout History
      </p>

      {workouts.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-faint)", paddingTop: 8 }}>No workouts logged</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 480 }}>
              <thead>
                <tr>
                  {([
                    { key: "date" as SortKey, label: "Date" },
                    { key: "activity" as SortKey, label: "Activity" },
                    { key: "duration_mins" as SortKey, label: "Duration" },
                    { key: "calories" as SortKey, label: "Calories" },
                    { key: "avg_hr" as SortKey, label: "Avg HR" },
                  ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                    <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                      <span className="flex items-center gap-1">
                        {label}
                        <SortIcon col={key} sortKey={sortKey} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((w, i) => (
                  <tr key={i}>
                    <td style={{ ...tdBase, color: "var(--color-text-muted)" }}>{fmtDate(w.date)}</td>
                    <td style={{ ...tdBase, fontWeight: 500, textTransform: "capitalize" }}>{w.activity ?? "—"}</td>
                    <td style={{ ...tdBase, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                    </td>
                    <td style={{ ...tdBase, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {w.calories != null ? `${w.calories}` : "—"}
                    </td>
                    <td style={{ ...tdBase, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {w.avg_hr != null ? `${w.avg_hr} bpm` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{ background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{ background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
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
