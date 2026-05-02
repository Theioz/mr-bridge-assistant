"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Plus,
  X,
  GripVertical,
  LayoutGrid,
  List,
  Trash2,
  Share2,
  Copy,
  Check,
  Link as LinkIcon,
} from "lucide-react";
import type {
  BacklogItem,
  BacklogStatus,
  MediaType,
  MetadataSearchResult,
  AllCounts,
  StatusCounts,
} from "@/lib/types";

interface ImportExtras {
  status: BacklogStatus;
  rating: number | null;
  review: string | null;
  session: { started_at: string | null; finished_at: string | null; notes: string | null } | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "all" | MediaType;
type SortKey = "priority" | "title" | "release_date" | "rating";
type ViewMode = "list" | "grid";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "game", label: "Games" },
  { id: "show", label: "Shows" },
  { id: "movie", label: "Movies" },
  { id: "book", label: "Books" },
];

const MEDIA_LABELS: Record<string, string> = {
  game: "Game",
  show: "Show",
  movie: "Movie",
  book: "Book",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Queued",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
};

const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--color-text-muted)",
  active: "var(--color-primary)",
  paused: "#f59e0b",
  finished: "#22c55e",
  dropped: "#ef4444",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGenres(item: BacklogItem): string[] {
  const m = item.metadata as Record<string, unknown> | null;
  if (!m) return [];
  if (Array.isArray(m.genres)) {
    return (m.genres as Array<string | { name?: string }>)
      .map((g) => (typeof g === "string" ? g : (g.name ?? "")))
      .filter(Boolean)
      .slice(0, 4);
  }
  return [];
}

function buildApiUrl(
  tab: Tab,
  q: string | null,
  status: string | null,
  year: string | null,
  offset: number,
  limit = 50,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (tab !== "all") params.set("type", tab);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (year) params.set("year", year);
  return `/api/backlog?${params.toString()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--color-text-on-primary, #fff)",
        background: STATUS_COLORS[status] ?? "var(--color-text-muted)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function CoverThumb({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return (
      <div
        style={{
          width: 40,
          height: 56,
          borderRadius: 4,
          background: "var(--color-bg-2)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: "var(--color-text-muted)",
        }}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={title}
      width={40}
      height={56}
      style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
    />
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<MediaType, string> = {
  game: "#818cf8",
  show: "#a855f7",
  movie: "#f43f5e",
  book: "#34d399",
};

const TYPE_LABELS: Record<MediaType, string> = {
  game: "Games",
  show: "Shows",
  movie: "Movies",
  book: "Books",
};

const QUEUED_COLOR = "rgba(148,163,184,0.4)";

function StatusBar({ statusCounts, height = 6 }: { statusCounts: StatusCounts; height?: number }) {
  const n = statusCounts.total;
  if (n === 0)
    return <div style={{ height, borderRadius: 999, background: "var(--color-bg-2)" }} />;
  const pct = (count: number) => `${((count / n) * 100).toFixed(1)}%`;
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: 999,
        overflow: "hidden",
        background: "var(--color-bg-2)",
      }}
    >
      <div
        style={{
          width: pct(statusCounts.finished),
          background: "#22c55e",
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.active),
          background: "var(--color-primary)",
          transition: "width 0.3s",
        }}
      />
      <div
        style={{ width: pct(statusCounts.paused), background: "#f59e0b", transition: "width 0.3s" }}
      />
      <div
        style={{
          width: pct(statusCounts.dropped),
          background: "#ef4444",
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.backlog),
          background: QUEUED_COLOR,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

function SummaryStrip({ counts, activeTab }: { counts: AllCounts; activeTab: Tab }) {
  const tabCounts = counts[activeTab];
  const { total, active, finished, backlog: queued, paused, dropped } = tabCounts;
  if (total === 0) return null;

  const cardBase = {
    background: "var(--color-bg-1)",
    border: "1px solid var(--rule-soft)",
    borderRadius: 10,
  };

  const statLabel = {
    fontSize: 11 as const,
    color: "var(--color-text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: 2,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Media type breakdown — All tab only */}
      {activeTab === "all" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {(["game", "show", "movie", "book"] as MediaType[]).map((type) => {
            const typeCounts = counts[type];
            const count = typeCounts.total;
            const color = TYPE_COLORS[type];
            return (
              <div
                key={type}
                style={{
                  ...cardBase,
                  borderTop: `3px solid ${count > 0 ? color : "var(--rule-soft)"}`,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  opacity: count === 0 ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 600,
                    }}
                  >
                    {TYPE_LABELS[type]}
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: count > 0 ? color : "var(--color-text-muted)",
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </span>
                </div>
                <StatusBar statusCounts={typeCounts} height={4} />
              </div>
            );
          })}
        </div>
      )}

      {/* Status stats + completion */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: total, color: "var(--color-text)" },
          { label: "Active", value: active, color: "var(--color-primary)" },
          { label: "Finished", value: finished, color: "#22c55e" },
          { label: "Queued", value: queued, color: "var(--color-text-muted)" },
          ...(paused > 0 ? [{ label: "Paused", value: paused, color: "#f59e0b" }] : []),
          ...(dropped > 0 ? [{ label: "Dropped", value: dropped, color: "#ef4444" }] : []),
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardBase, padding: "10px 14px", minWidth: 72 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            <div style={statLabel}>{label}</div>
          </div>
        ))}

        {/* Completion bar */}
        <div style={{ ...cardBase, flex: 1, minWidth: 200, padding: "10px 14px" }}>
          <div style={{ ...statLabel, marginTop: 0, marginBottom: 8 }}>Completion</div>
          <StatusBar statusCounts={tabCounts} height={8} />
          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { label: "Finished", color: "#22c55e", n: finished },
              { label: "Active", color: "var(--color-primary)", n: active },
              { label: "Paused", color: "#f59e0b", n: paused },
              { label: "Dropped", color: "#ef4444", n: dropped },
              { label: "Queued", color: QUEUED_COLOR, n: queued },
            ]
              .filter(({ n }) => n > 0)
              .map(({ label, color, n }) => (
                <span
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                  {label} · {n}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Type picker modal ─────────────────────────────────────────────────────────

const TYPE_OPTIONS: { id: MediaType; label: string; emoji: string }[] = [
  { id: "game", label: "Game", emoji: "🎮" },
  { id: "show", label: "Show", emoji: "📺" },
  { id: "movie", label: "Movie", emoji: "🎬" },
  { id: "book", label: "Book", emoji: "📖" },
];

function TypePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (type: MediaType) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 60,
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--color-bg-1)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 360,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>What are you adding?</p>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--color-text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16 }}>
          {TYPE_OPTIONS.map(({ id, label, emoji }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "16px 12px",
                background: "var(--color-bg-2)",
                border: "1px solid var(--rule-soft)",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text)",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-primary)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--color-primary-bg, rgba(99,102,241,0.08))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rule-soft)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-2)";
              }}
            >
              <span style={{ fontSize: 24 }}>{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Search modal ──────────────────────────────────────────────────────────────

const LIB_STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];
const LIB_STATUS_LABELS: Record<string, string> = {
  backlog: "Queued",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
};
const LIB_STATUS_COLORS: Record<string, string> = {
  backlog: "var(--color-text-muted)",
  active: "var(--color-primary)",
  paused: "#f59e0b",
  finished: "#22c55e",
  dropped: "#ef4444",
};

function SearchModal({
  type,
  onClose,
  onImport,
  existingItems,
}: {
  type: MediaType;
  onClose: () => void;
  onImport: (result: MetadataSearchResult, extras: ImportExtras) => Promise<void>;
  existingItems: BacklogItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 state
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<MetadataSearchResult | null>(null);
  const [preStatus, setPreStatus] = useState<BacklogStatus>("backlog");
  const [preRating, setPreRating] = useState("");
  const [preReview, setPreReview] = useState("");
  const [preStarted, setPreStarted] = useState("");
  const [preFinished, setPreFinished] = useState("");
  const [preNotes, setPreNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const existingMap = new Map(
    existingItems.filter((i) => i.external_id).map((i) => [i.external_id!, i.id]),
  );

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!q.trim()) {
        setResults([]);
        return;
      }
      timerRef.current = setTimeout(async () => {
        setLoading(true);
        setError("");
        try {
          const res = await fetch(`/api/backlog/search?type=${type}&q=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Search failed");
          setResults(data.results ?? []);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Search failed");
        } finally {
          setLoading(false);
        }
      }, 400);
    },
    [type],
  );

  const labelMap: Record<string, string> = {
    game: "games",
    show: "shows",
    movie: "movies",
    book: "books",
  };

  const openPreAdd = (r: MetadataSearchResult) => {
    setSelected(r);
    setPreStatus("backlog");
    setPreRating("");
    setPreReview("");
    setPreStarted("");
    setPreFinished("");
    setPreNotes("");
    setStep(2);
  };

  const submitPreAdd = async () => {
    if (!selected) return;
    setSubmitting(true);
    await onImport(selected, {
      status: preStatus,
      rating: preRating ? parseFloat(preRating) : null,
      review: preReview || null,
      session:
        preStarted || preFinished || preNotes
          ? {
              started_at: preStarted || null,
              finished_at: preFinished || null,
              notes: preNotes || null,
            }
          : null,
    });
    setSubmitting(false);
  };

  const inputStyle = {
    border: "1px solid var(--rule-soft)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    background: "var(--color-bg-1)",
    color: "var(--color-text)",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    fontSize: 11,
    color: "var(--color-text-muted)",
    fontWeight: 600 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    display: "block" as const,
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 60,
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--color-bg-1)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 520,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {step === 1 && (
          <>
            <div
              style={{ padding: "16px 16px 8px", display: "flex", gap: 8, alignItems: "center" }}
            >
              <Search size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
              <input
                autoFocus
                type="text"
                placeholder={`Search ${labelMap[type] ?? type}…`}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  search(e.target.value);
                }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 15,
                  color: "var(--color-text)",
                }}
              />
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--color-text-muted)",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ borderBottom: "1px solid var(--rule-soft)" }} />

            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && (
                <p
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontSize: 14,
                  }}
                >
                  Searching…
                </p>
              )}
              {!loading && error && (
                <p style={{ padding: 20, color: "var(--color-danger, #ef4444)", fontSize: 14 }}>
                  {error}
                </p>
              )}
              {!loading && !error && results.length === 0 && query && (
                <p
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontSize: 14,
                  }}
                >
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}
              {results.map((r) => {
                const isDup = r.external_id ? existingMap.has(r.external_id) : false;
                return (
                  <div
                    key={r.external_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--rule-soft)",
                    }}
                  >
                    {r.cover_url ? (
                      <img
                        src={r.cover_url}
                        alt={r.title}
                        width={36}
                        height={52}
                        style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 52,
                          borderRadius: 4,
                          background: "var(--color-bg-2)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 600,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.title}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 12,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {r.creator}
                        {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                      </p>
                      {isDup && (
                        <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                          Already in library
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => openPreAdd(r)}
                      style={{
                        background: "var(--color-primary)",
                        color: "var(--color-text-on-primary, #fff)",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--rule-soft)" }}>
              <button
                onClick={() => {
                  if (!query.trim()) return;
                  openPreAdd({
                    external_id: "",
                    external_source: "manual",
                    title: query.trim(),
                    creator: "",
                    release_date: null,
                    description: "",
                    cover_url: "",
                    metadata: {},
                  });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontSize: 13,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {query ? `Add "${query}" manually` : "Add manually"}
              </button>
            </div>
          </>
        )}

        {step === 2 && selected && (
          <>
            {/* Step 2 header */}
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <button
                onClick={() => setStep(1)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: 13,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ← Back
              </button>
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1, textAlign: "center" }}>
                Add to Library
              </span>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--color-text-muted)",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                overflowY: "auto",
                flex: 1,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Item preview */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {selected.cover_url && (
                  <img
                    src={selected.cover_url}
                    alt={selected.title}
                    width={48}
                    height={68}
                    style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{selected.title}</p>
                  {selected.release_date && (
                    <p
                      style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}
                    >
                      {selected.release_date.slice(0, 4)}
                    </p>
                  )}
                </div>
              </div>

              {/* Duplicate warning */}
              {selected.external_id && existingMap.has(selected.external_id) && (
                <div
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 13,
                  }}
                >
                  <strong>Already in your library.</strong>{" "}
                  <a
                    href={`/library/${existingMap.get(selected.external_id)}`}
                    style={{ color: "var(--color-primary)" }}
                  >
                    View existing item →
                  </a>
                </div>
              )}

              {/* Status */}
              <div>
                <label style={labelStyle}>Status</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {LIB_STATUSES.map((s) => {
                    const active = preStatus === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setPreStatus(s)}
                        style={{
                          border: `1px solid ${active ? LIB_STATUS_COLORS[s] : "var(--rule-soft)"}`,
                          borderRadius: 999,
                          padding: "4px 12px",
                          fontSize: 12,
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          background: active ? LIB_STATUS_COLORS[s] : "none",
                          color: active
                            ? "var(--color-text-on-primary, #fff)"
                            : "var(--color-text)",
                        }}
                      >
                        {LIB_STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rating */}
              <div>
                <label style={labelStyle}>Rating</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, minWidth: 36, textAlign: "right" }}>
                    {preRating ? Number(preRating).toFixed(1) : "—"}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>/ 10</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.1}
                    value={preRating || 0}
                    onChange={(e) => setPreRating(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPreRating("")}
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 6px",
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              {/* Review */}
              <div>
                <label style={labelStyle}>Review</label>
                <textarea
                  placeholder="Write a review…"
                  rows={3}
                  value={preReview}
                  onChange={(e) => setPreReview(e.target.value)}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>

              {/* Session dates */}
              <div>
                <label style={labelStyle}>Session</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Started</label>
                    <input
                      type="date"
                      value={preStarted}
                      onChange={(e) => setPreStarted(e.target.value)}
                      style={{ ...inputStyle, width: "auto" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Finished</label>
                    <input
                      type="date"
                      value={preFinished}
                      onChange={(e) => setPreFinished(e.target.value)}
                      style={{ ...inputStyle, width: "auto" }}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Notes (e.g. 2nd playthrough, Nightmare difficulty)"
                  value={preNotes}
                  onChange={(e) => setPreNotes(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Submit */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--rule-soft)" }}>
              <button
                disabled={submitting}
                onClick={submitPreAdd}
                style={{
                  width: "100%",
                  background: "var(--color-primary)",
                  color: "var(--color-text-on-primary, #fff)",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Adding…" : "Confirm Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  showType,
  draggable: isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDelete,
}: {
  item: BacklogItem;
  showType?: boolean;
  draggable: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (targetId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const genres = getGenres(item);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove "${item.title}" from your library?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/backlog/${item.id}`, { method: "DELETE" });
    if (res.ok) onDelete(item.id);
    else setDeleting(false);
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={() => isDraggable && onDragStart(item.id)}
      onDragOver={(e) => {
        if (!isDraggable) return;
        e.preventDefault();
        onDragOver(e, item.id);
      }}
      onDrop={(e) => {
        if (!isDraggable) return;
        e.preventDefault();
        onDrop(item.id);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--rule-soft)",
        cursor: "default",
      }}
    >
      {isDraggable && (
        <GripVertical
          size={14}
          style={{ color: "var(--color-text-muted)", flexShrink: 0, cursor: "grab", opacity: 0.4 }}
        />
      )}
      <Link
        href={`/library/${item.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <CoverThumb url={item.cover_url} title={item.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 14,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.title}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            {item.creator}
            {item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ""}
            {item.media_type === "game" &&
            (item.metadata as Record<string, unknown> | null)?.played_on
              ? ` · ${String((item.metadata as Record<string, unknown>).played_on)}`
              : ""}
          </p>
          {(genres.length > 0 || showType) && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
              {showType && (
                <span
                  style={{
                    fontSize: 10,
                    background: "var(--color-primary-bg, rgba(99,102,241,0.12))",
                    color: "var(--color-primary)",
                    border: "1px solid var(--color-primary-border, rgba(99,102,241,0.25))",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontWeight: 600,
                  }}
                >
                  {MEDIA_LABELS[item.media_type] ?? item.media_type}
                </span>
              )}
              {genres.map((g) => (
                <span
                  key={g}
                  style={{
                    fontSize: 10,
                    background: "var(--color-bg-2)",
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 4,
                    padding: "1px 6px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {item.rating != null && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>
            {Number(item.rating).toFixed(1)}
          </span>
        )}
        <StatusBadge status={item.status} />
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Remove from library"
          style={{
            background: "none",
            border: "none",
            cursor: deleting ? "not-allowed" : "pointer",
            color: "var(--color-text-muted)",
            padding: "4px",
            opacity: deleting ? 0.3 : 0.5,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Cover grid ────────────────────────────────────────────────────────────────

function CoverCard({ item, showType }: { item: BacklogItem; showType?: boolean }) {
  const statusDot: Record<string, string> = {
    active: "var(--color-primary)",
    finished: "#22c55e",
    paused: "#f59e0b",
    dropped: "#ef4444",
    backlog: "var(--color-text-muted)",
  };

  return (
    <Link
      href={`/library/${item.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 8,
          overflow: "hidden",
          aspectRatio: "2/3",
          background: "var(--color-bg-2)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
        }}
      >
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={item.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "var(--color-text-muted)",
            }}
          >
            ?
          </div>
        )}

        {/* Status dot */}
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: statusDot[item.status] ?? "var(--color-text-muted)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.6)",
          }}
        />

        {/* Type badge — only on All tab */}
        {showType && (
          <span
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              fontSize: 9,
              fontWeight: 700,
              background: "rgba(0,0,0,0.75)",
              color: "var(--color-primary)",
              borderRadius: 4,
              padding: "2px 5px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.media_type}
          </span>
        )}

        {/* Title overlay at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "20px 8px 8px",
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </p>
          {item.release_date && (
            <p style={{ margin: "1px 0 0", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
              {item.release_date.slice(0, 4)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function CoverGrid({ items, showType }: { items: BacklogItem[]; showType?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((item) => (
        <CoverCard key={item.id} item={item} showType={showType} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

export default function LibraryClient({
  initialItems,
  initialCounts,
  initialShareToken,
}: {
  initialItems: BacklogItem[];
  initialCounts: AllCounts;
  initialShareToken: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── UI state ────────────────────────────────────────────────────────────────
  const validTabs: Tab[] = ["all", "game", "show", "movie", "book"];
  const paramTab = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    paramTab && validTabs.includes(paramTab) ? paramTab : "all",
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [searchMediaType, setSearchMediaType] = useState<MediaType | null>(null);
  // Snapshot frozen when the search modal opens — prevents false-positive duplicate badges
  // when handleImport prepends the new item to displayedItems before navigating away.
  const [existingItemsSnapshot, setExistingItemsSnapshot] = useState<BacklogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // ── Share state ──────────────────────────────────────────────────────────────
  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "");
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareUrl = shareToken ? `${appUrl}/share/library/${shareToken}` : null;

  const generateShareLink = async () => {
    setShareLoading(true);
    const res = await fetch("/api/library/share", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setShareToken(data.share_token as string);
    }
    setShareLoading(false);
  };

  const revokeShareLink = async () => {
    setShareLoading(true);
    const res = await fetch("/api/library/share", { method: "DELETE" });
    if (res.ok) setShareToken(null);
    setShareLoading(false);
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // ── Pagination + lazy-load state ────────────────────────────────────────────
  // Global counts — used by SummaryStrip and tab badges (never stale from pagination)
  const [counts, setCounts] = useState<AllCounts>(initialCounts);

  // Per-tab item cache (ref — no renders triggered by cache writes)
  const tabCacheRef = useRef<Partial<Record<Tab, BacklogItem[]>>>({ all: initialItems });
  // Per-tab "has more pages" tracking (ref — only hasMore state triggers render)
  const tabHasMoreRef = useRef<Record<Tab, boolean>>({
    all: initialItems.length >= 50,
    game: true,
    show: true,
    movie: true,
    book: true,
  });
  // Current tab ref — lets effects read latest tab without depending on it
  const activeTabRef = useRef<Tab>(
    paramTab && validTabs.includes(paramTab) ? (paramTab as Tab) : "all",
  );

  // Displayed items + pagination
  // initialItems is always the "all" tab SSR data; if URL lands on a specific tab we'll
  // fetch the correct items in the mount effect below.
  const [displayedItems, setDisplayedItems] = useState<BacklogItem[]>(
    !paramTab || paramTab === "all" ? initialItems : [],
  );
  // API-level offset (pre genre-filter); used for Load More requests
  const [displayedOffset, setDisplayedOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(initialItems.length >= 50);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const hasServerFilter = !!(searchQuery || filterStatus || filterYear);
  const hasFilter = !!(searchQuery || filterStatus || filterGenre || filterYear);
  const canDrag = activeTab !== "all" && sortBy === "priority" && !hasFilter;
  const showType = activeTab === "all";

  // Client-side sort applied on top of whatever the server returned
  const sortedDisplayedItems = useMemo(() => {
    if (sortBy === "title")
      return [...displayedItems].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "rating")
      return [...displayedItems].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sortBy === "release_date")
      return [...displayedItems].sort((a, b) =>
        (b.release_date ?? "").localeCompare(a.release_date ?? ""),
      );
    return displayedItems; // priority order already from server
  }, [displayedItems, sortBy]);

  // Genre + year dropdowns derived from loaded items
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    displayedItems.forEach((item) => getGenres(item).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [displayedItems]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    displayedItems.forEach((item) => {
      if (item.release_date) set.add(item.release_date.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [displayedItems]);

  // ── Mount effect — fetch correct items when URL lands on a non-"all" tab ────
  useEffect(() => {
    const tab = activeTabRef.current;
    if (tab === "all") return; // initialItems already covers "all"
    let cancelled = false;
    setTabLoading(true);
    fetch(`/api/backlog?limit=50&offset=0&type=${tab}`)
      .then((r) => r.json())
      .then((data: { items: BacklogItem[] }) => {
        if (cancelled) return;
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: data.items };
        tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: data.items.length >= 50 };
        setDisplayedItems(data.items);
        setDisplayedOffset(data.items.length);
        setHasMore(data.items.length >= 50);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Tab switch ──────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback(
    async (tab: Tab) => {
      setActiveTab(tab);
      activeTabRef.current = tab;
      router.replace(tab === "all" ? "/library" : `/library?tab=${tab}`, { scroll: false });
      setFilterGenre(null);
      setFilterYear(null);

      // searchQuery + filterStatus may still be active — check them before clearing
      const serverFilterActive = !!(searchQuery || filterStatus);

      if (!serverFilterActive) {
        // No server filter — use cache or fetch unfiltered
        const cached = tabCacheRef.current[tab];
        if (cached !== undefined) {
          setDisplayedItems(cached);
          setDisplayedOffset(cached.length);
          setHasMore(tabHasMoreRef.current[tab] ?? false);
          return;
        }
        setTabLoading(true);
        try {
          const url = `/api/backlog?limit=50&offset=0${tab !== "all" ? `&type=${tab}` : ""}`;
          const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
          tabCacheRef.current = { ...tabCacheRef.current, [tab]: data.items };
          tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: data.items.length >= 50 };
          setDisplayedItems(data.items);
          setDisplayedOffset(data.items.length);
          setHasMore(data.items.length >= 50);
        } catch {
          // silent — display stays as-is
        } finally {
          setTabLoading(false);
        }
      } else {
        // Server filter active — fetch with filter + new tab (filterYear/genre just cleared above)
        setTabLoading(true);
        try {
          const url = buildApiUrl(tab, searchQuery || null, filterStatus, null, 0);
          const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
          setDisplayedItems(data.items);
          setDisplayedOffset(data.items.length);
          setHasMore(data.items.length >= 50);
        } catch {
          // silent
        } finally {
          setTabLoading(false);
        }
      }
    },
    [searchQuery, filterStatus],
  );

  // ── Filter effect ───────────────────────────────────────────────────────────
  // Fires on filter value changes only (not on tab changes — those go through handleTabSwitch).
  // Reads activeTabRef to get the current tab without creating a dependency on activeTab state.
  useEffect(() => {
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);

    const tab = activeTabRef.current;

    if (!hasServerFilter && !filterGenre) {
      // No filter — restore from cache (handles the "filter cleared" case)
      const cached = tabCacheRef.current[tab];
      if (cached !== undefined) {
        setDisplayedItems(cached);
        setDisplayedOffset(cached.length);
        setHasMore(tabHasMoreRef.current[tab] ?? false);
      } else {
        // Cache miss (e.g. filter cleared on a tab that was only ever visited with a filter)
        setTabLoading(true);
        const url = `/api/backlog?limit=50&offset=0${tab !== "all" ? `&type=${tab}` : ""}`;
        fetch(url)
          .then((r) => r.json())
          .then(({ items }: { items: BacklogItem[] }) => {
            tabCacheRef.current = { ...tabCacheRef.current, [tab]: items };
            tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: items.length >= 50 };
            setDisplayedItems(items);
            setDisplayedOffset(items.length);
            setHasMore(items.length >= 50);
          })
          .catch(() => {})
          .finally(() => setTabLoading(false));
      }
      return;
    }

    if (!hasServerFilter && filterGenre) {
      // Genre-only — client-side post-filter on cached items
      const source = tabCacheRef.current[tab] ?? [];
      setDisplayedItems(source.filter((i) => getGenres(i).includes(filterGenre)));
      setDisplayedOffset(source.length);
      // Show Load More based on whether there are more unfiltered pages (genre can't paginate server-side)
      setHasMore(tabHasMoreRef.current[tab] ?? false);
      return;
    }

    // Server filter — debounce text search, fire immediately for dropdowns
    const delay = searchQuery ? 300 : 0;
    filterTimerRef.current = setTimeout(async () => {
      setTabLoading(true);
      try {
        const url = buildApiUrl(tab, searchQuery || null, filterStatus, filterYear, 0);
        const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
        const postFiltered = filterGenre
          ? data.items.filter((i) => getGenres(i).includes(filterGenre))
          : data.items;
        setDisplayedItems(postFiltered);
        setDisplayedOffset(data.items.length);
        setHasMore(data.items.length >= 50);
      } catch {
        // silent
      } finally {
        setTabLoading(false);
      }
    }, delay);

    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, [searchQuery, filterStatus, filterGenre, filterYear, hasServerFilter]);

  // ── Load more ───────────────────────────────────────────────────────────────
  const loadMoreItems = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const tab = activeTabRef.current;
      const url = buildApiUrl(tab, searchQuery || null, filterStatus, filterYear, displayedOffset);
      const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
      const newItems = data.items;

      if (!hasServerFilter) {
        const existing = tabCacheRef.current[tab] ?? [];
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: [...existing, ...newItems] };
        tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: newItems.length >= 50 };
      }

      const postFiltered = filterGenre
        ? newItems.filter((i) => getGenres(i).includes(filterGenre))
        : newItems;
      setDisplayedItems((prev) => [...prev, ...postFiltered]);
      setDisplayedOffset((prev) => prev + newItems.length);
      setHasMore(newItems.length >= 50);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Import handler ──────────────────────────────────────────────────────────
  const handleImport = async (result: MetadataSearchResult, extras: ImportExtras) => {
    const mediaType = searchMediaType ?? (activeTab === "all" ? "game" : activeTab);
    const res = await fetch("/api/backlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: mediaType,
        title: result.title,
        creator: result.creator || null,
        release_date: result.release_date,
        description: result.description || null,
        cover_url: result.cover_url || null,
        external_id: result.external_id || null,
        external_source: result.external_source || "manual",
        metadata: result.metadata,
        status: extras.status,
        rating: extras.rating,
        review: extras.review,
      }),
    });
    if (!res.ok) return;
    const newItem = (await res.json()) as BacklogItem;
    if (extras.session) {
      await fetch(`/api/backlog/${newItem.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extras.session),
      });
    }
    // Optimistic update — prepend to displayed list and both caches
    setDisplayedItems((prev) => [newItem, ...prev]);
    const allCached = tabCacheRef.current["all"];
    if (allCached) tabCacheRef.current = { ...tabCacheRef.current, all: [newItem, ...allCached] };
    const tab = activeTabRef.current;
    if (tab !== "all") {
      const tabCached = tabCacheRef.current[tab];
      if (tabCached)
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: [newItem, ...tabCached] };
    }
    // Update global counts
    const st = extras.status as BacklogStatus;
    setCounts((prev) => ({
      ...prev,
      all: { ...prev.all, [st]: (prev.all[st] as number) + 1, total: prev.all.total + 1 },
      [mediaType]: {
        ...prev[mediaType as MediaType],
        [st]: ((prev[mediaType as MediaType] as Record<string, number>)[st] ?? 0) + 1,
        total: prev[mediaType as MediaType].total + 1,
      },
    }));
    router.refresh();
    router.push(`/library/${newItem.id}`);
  };

  // ── Drag reorder ────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => {
    dragId.current = id;
  };
  const handleDragOver = (_e: React.DragEvent, id: string) => {
    dragOverId.current = id;
  };
  const handleDrop = async (targetId: string) => {
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) return;

    const srcIdx = displayedItems.findIndex((i) => i.id === srcId);
    const tgtIdx = displayedItems.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const prevItems = [...displayedItems];
    const reordered = [...displayedItems];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    const updated = reordered.map((item, idx) => ({ ...item, priority: idx }));

    setDisplayedItems(updated);
    const tab = activeTabRef.current;
    tabCacheRef.current = { ...tabCacheRef.current, [tab]: updated };

    await Promise.all(
      updated
        .filter((item, idx) => item.priority !== prevItems[idx]?.priority)
        .map((item) =>
          fetch(`/api/backlog/${item.id}/priority`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: item.priority }),
          }),
        ),
    );

    dragId.current = null;
    dragOverId.current = null;
  };

  // ── Delete item ─────────────────────────────────────────────────────────────
  const handleDeleteItem = (id: string) => {
    setDisplayedItems((prev) => prev.filter((i) => i.id !== id));
    const tab = activeTabRef.current;
    tabCacheRef.current = {
      ...tabCacheRef.current,
      all: (tabCacheRef.current.all ?? []).filter((i) => i.id !== id),
      [tab]: (tabCacheRef.current[tab] ?? []).filter((i) => i.id !== id),
    };
    const deletedItem = displayedItems.find((i) => i.id === id);
    if (deletedItem) {
      const mt = deletedItem.media_type as MediaType;
      const st = deletedItem.status as BacklogStatus;
      setCounts((prev) => ({
        ...prev,
        all: {
          ...prev.all,
          [st]: Math.max(0, (prev.all[st] as number) - 1),
          total: Math.max(0, prev.all.total - 1),
        },
        [mt]: {
          ...prev[mt],
          [st]: Math.max(0, (prev[mt][st] as number) - 1),
          total: Math.max(0, prev[mt].total - 1),
        },
      }));
    }
  };

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus(null);
    setFilterGenre(null);
    setFilterYear(null);
  };

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

  // ── Grouped items for list view ─────────────────────────────────────────────
  const activeItems = sortedDisplayedItems.filter((i) => i.status === "active");
  const queuedItems = sortedDisplayedItems.filter((i) => i.status === "backlog");
  const pausedItems = sortedDisplayedItems.filter((i) => i.status === "paused");
  const finishedItems = sortedDisplayedItems.filter((i) => i.status === "finished");
  const droppedItems = sortedDisplayedItems.filter((i) => i.status === "dropped");

  const tabTotal = counts[activeTab].total;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Library</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Your personal media collection
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View toggle */}
          <div
            style={{
              display: "flex",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {(["list", "grid"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  background: viewMode === mode ? "var(--color-bg-2)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "7px 10px",
                  display: "flex",
                  alignItems: "center",
                  color: viewMode === mode ? "var(--color-text)" : "var(--color-text-muted)",
                  transition: "background 0.15s, color 0.15s",
                }}
                title={mode === "list" ? "List view" : "Cover view"}
              >
                {mode === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
              </button>
            ))}
          </div>

          {/* Share button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowSharePanel((p) => !p)}
              title="Share library"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: shareToken
                  ? "var(--color-primary-bg, rgba(99,102,241,0.12))"
                  : "transparent",
                color: shareToken ? "var(--color-primary)" : "var(--color-text-muted)",
                border: "1px solid var(--rule-soft)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Share2 size={15} />
            </button>

            {showSharePanel && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: 340,
                  background: "var(--color-bg-1)",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 10,
                  padding: 16,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Public Library Link</p>
                  <button
                    onClick={() => setShowSharePanel(false)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                      padding: 2,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {shareToken
                    ? "Anyone with this link can view your full library."
                    : "Generate a public link to share your entire library — no account needed to view."}
                </p>

                {shareToken ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "var(--color-bg-2)",
                        border: "1px solid var(--rule-soft)",
                        borderRadius: 6,
                        padding: "7px 10px",
                        marginBottom: 10,
                      }}
                    >
                      <LinkIcon
                        size={12}
                        style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-muted)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shareUrl}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={copyShareUrl}
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: "var(--color-primary)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {shareCopied ? (
                          <>
                            <Check size={13} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy link
                          </>
                        )}
                      </button>
                      <button
                        onClick={revokeShareLink}
                        disabled={shareLoading}
                        style={{
                          background: "none",
                          border: "1px solid var(--rule-soft)",
                          borderRadius: 6,
                          padding: "8px 12px",
                          fontSize: 13,
                          color: "var(--color-text-muted)",
                          cursor: shareLoading ? "not-allowed" : "pointer",
                          opacity: shareLoading ? 0.5 : 1,
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={generateShareLink}
                    disabled={shareLoading}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      background: "var(--color-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "9px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: shareLoading ? "not-allowed" : "pointer",
                      opacity: shareLoading ? 0.6 : 1,
                    }}
                  >
                    {shareLoading ? (
                      "Generating…"
                    ) : (
                      <>
                        <Share2 size={14} /> Generate link
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (activeTab === "all") {
                setShowTypePicker(true);
              } else {
                setExistingItemsSnapshot(displayedItems);
                setSearchMediaType(activeTab);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--color-primary)",
              color: "var(--color-text-on-primary, #fff)",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Summary strip — always shows global totals, unaffected by filters */}
      <SummaryStrip counts={counts} activeTab={activeTab} />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 16,
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        {TABS.map((tab) => {
          const count = counts[tab.id].total;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 11,
                    background: isActive ? "var(--color-primary)" : "var(--color-bg-2)",
                    color: isActive
                      ? "var(--color-text-on-primary, #fff)"
                      : "var(--color-text-muted)",
                    borderRadius: 999,
                    padding: "1px 6px",
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
                background: "var(--color-primary-bg, rgba(99,102,241,0.12))",
                border: "1px solid var(--color-primary-border, rgba(99,102,241,0.25))",
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

      {/* Tab loading indicator */}
      {tabLoading && (
        <p
          style={{
            padding: "16px 0",
            color: "var(--color-text-muted)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Loading…
        </p>
      )}

      {/* Empty state — no items in this tab at all */}
      {!tabLoading && tabTotal === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 15 }}>
            Nothing in your library
            {activeTab !== "all"
              ? ` for ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()}`
              : ""}{" "}
            yet.
          </p>
          <button
            onClick={() => {
              if (activeTab === "all") setShowTypePicker(true);
              else {
                setExistingItemsSnapshot(displayedItems);
                setSearchMediaType(activeTab);
              }
            }}
            style={{
              marginTop: 12,
              background: "none",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            Add your first one
          </button>
        </div>
      )}

      {/* No filter results */}
      {!tabLoading && tabTotal > 0 && sortedDisplayedItems.length === 0 && hasFilter && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 14 }}>No items match the current filters.</p>
          <button
            onClick={clearFilters}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              fontSize: 13,
              color: "var(--color-primary)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Item list */}
      {!tabLoading && sortedDisplayedItems.length > 0 && (
        <div>
          {viewMode === "grid" ? (
            <CoverGrid items={sortedDisplayedItems} showType={showType} />
          ) : (
            <>
              {activeItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showType={showType}
                  draggable={canDrag}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDelete={handleDeleteItem}
                />
              ))}
              {[...queuedItems, ...pausedItems, ...finishedItems, ...droppedItems].map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showType={showType}
                  draggable={canDrag && (item.status === "backlog" || item.status === "paused")}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDelete={handleDeleteItem}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Load More */}
      {!tabLoading && hasMore && sortedDisplayedItems.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 8px" }}>
          <button
            onClick={loadMoreItems}
            disabled={loadingMore}
            style={{
              background: "var(--color-bg-1)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              color: loadingMore ? "var(--color-text-muted)" : "var(--color-text)",
              cursor: loadingMore ? "not-allowed" : "pointer",
              opacity: loadingMore ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Type picker — shown when adding from the All tab */}
      {showTypePicker && (
        <TypePickerModal
          onSelect={(type) => {
            setShowTypePicker(false);
            setExistingItemsSnapshot(displayedItems);
            setSearchMediaType(type);
          }}
          onClose={() => setShowTypePicker(false)}
        />
      )}

      {/* Search modal */}
      {searchMediaType && (
        <SearchModal
          type={searchMediaType}
          onClose={() => setSearchMediaType(null)}
          onImport={handleImport}
          existingItems={existingItemsSnapshot}
        />
      )}
    </div>
  );
}
