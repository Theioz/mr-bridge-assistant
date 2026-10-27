"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { sortRows, type SortDir, type SortValue } from "@/lib/jobs/table";

export type Column<T> = {
  key: string;
  label: string;
  /** CSS width of the column (the table is table-layout: fixed). */
  width: string;
  render: (row: T) => ReactNode;
  /** Present = the header sorts by this value. */
  sortValue?: (row: T) => SortValue;
  /** Stays put while the table scrolls sideways (the Role column on a phone). */
  sticky?: boolean;
  /** Tooltip for truncated cells. */
  title?: (row: T) => string | undefined;
};

/**
 * A Notion-style database table: a real <table>, sticky header, compact single-line rows that
 * truncate, click-a-header to sort (asc, desc, back to the default order). Clicking a row (or
 * Enter on a focused row) calls onOpen, except when the click lands on a button, link or input
 * inside it — pills and links keep their own behaviour.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onOpen,
  label,
  empty,
  rowLabel,
}: {
  rows: T[];
  columns: Column<T>[];
  onOpen: (row: T) => void;
  label: string;
  empty: string;
  rowLabel: (row: T) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    return col?.sortValue ? sortRows(rows, col.sortValue, sort.dir) : rows;
  }, [rows, columns, sort]);
  const minWidth = `calc(${columns.map((c) => c.width).join(" + ")})`;

  function cycle(key: string) {
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  return (
    <div className="jobs-table-wrap">
      <table className="jobs-table" aria-label={label} style={{ minWidth }}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  data-sticky={c.sticky ? "" : undefined}
                  aria-sort={
                    active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="jobs-sort"
                      data-active={active ? "" : undefined}
                      onClick={() => cycle(c.key)}
                    >
                      {c.label}
                      {active &&
                        (sort!.dir === "asc" ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : (
                          <ArrowDown size={12} aria-hidden />
                        ))}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="jobs-faint">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr
                key={r.id}
                className="jobs-row"
                tabIndex={0}
                aria-label={rowLabel(r)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, select, textarea"))
                    return;
                  onOpen(r);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) {
                    e.preventDefault();
                    onOpen(r);
                  }
                }}
              >
                {columns.map((c) => (
                  <td key={c.key} data-sticky={c.sticky ? "" : undefined} title={c.title?.(r)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
