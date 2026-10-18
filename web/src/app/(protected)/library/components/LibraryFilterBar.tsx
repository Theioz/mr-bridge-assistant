"use client";

import { Search, X } from "lucide-react";
import { STATUS_LABELS, type SortKey } from "../shared";

const selectStyle = {
  WebkitAppearance: "none" as const,
  appearance: "none" as const,
  background: "var(--color-bg-1)",
  border: "1px solid var(--rule-soft)",
  borderRadius: 8,
  padding: "7px 28px 7px 10px",
  fontSize: 13,
  color: "var(--color-text)",
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 8px center" as const,
};

export default function LibraryFilterBar({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterGenre,
  setFilterGenre,
  filterYear,
  setFilterYear,
  sortBy,
  setSortBy,
  availableGenres,
  availableYears,
  clearFilters,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterStatus: string | null;
  setFilterStatus: (v: string | null) => void;
  filterGenre: string | null;
  setFilterGenre: (v: string | null) => void;
  filterYear: string | null;
  setFilterYear: (v: string | null) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
  availableGenres: string[];
  availableYears: string[];
  clearFilters: () => void;
}) {
  const activeChips = [
    filterStatus && {
      key: "status",
      label: `Status: ${STATUS_LABELS[filterStatus] ?? filterStatus}`,
      clear: () => setFilterStatus(null),
    },
    filterGenre && {
      key: "genre",
      label: `Genre: ${filterGenre}`,
      clear: () => setFilterGenre(null),
    },
    filterYear && { key: "year", label: `Year: ${filterYear}`, clear: () => setFilterYear(null) },
    searchQuery && { key: "search", label: `"${searchQuery}"`, clear: () => setSearchQuery("") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--color-bg-1)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 8,
            padding: "7px 12px",
            flex: 1,
            minWidth: 160,
            maxWidth: 260,
          }}
        >
          <Search size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--color-text)",
              width: "100%",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--color-text-muted)",
                display: "flex",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div style={{ position: "relative" }}>
          <select
            value={filterStatus ?? ""}
            onChange={(e) => setFilterStatus(e.target.value || null)}
            style={{
              ...selectStyle,
              borderColor: filterStatus ? "var(--color-primary)" : "var(--rule-soft)",
              color: filterStatus ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="backlog">Queued</option>
            <option value="paused">Paused</option>
            <option value="finished">Finished</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>

        {/* Genre filter — client-side post-filter on loaded items */}
        {availableGenres.length > 0 && (
          <div style={{ position: "relative" }}>
            <select
              value={filterGenre ?? ""}
              onChange={(e) => setFilterGenre(e.target.value || null)}
              style={{
                ...selectStyle,
                borderColor: filterGenre ? "var(--color-primary)" : "var(--rule-soft)",
                color: filterGenre ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              <option value="">All genres</option>
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Year filter */}
        {availableYears.length > 0 && (
          <div style={{ position: "relative" }}>
            <select
              value={filterYear ?? ""}
              onChange={(e) => setFilterYear(e.target.value || null)}
              style={{
                ...selectStyle,
                borderColor: filterYear ? "var(--color-primary)" : "var(--rule-soft)",
                color: filterYear ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              <option value="">All years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort */}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            style={{ ...selectStyle }}
          >
            <option value="priority">Priority order</option>
            <option value="title">Title A–Z</option>
            <option value="release_date">Release date</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {activeChips.map(({ key, label, clear }) => (
            <button
              key={key}
              onClick={clear}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "var(--color-primary-dim)",
                border: "1px solid var(--color-cta-subtle-strong)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
                color: "var(--color-primary)",
                cursor: "pointer",
              }}
            >
              {label} <X size={11} />
            </button>
          ))}
          {activeChips.length > 1 && (
            <button
              onClick={clearFilters}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: "var(--color-text-muted)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </>
  );
}
