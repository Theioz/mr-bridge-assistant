"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, X, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import type { BacklogItem, MediaType, MetadataSearchResult } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "all" | MediaType;
type SortKey = "priority" | "title" | "release_date" | "rating";

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

function SummaryStrip({ items }: { items: BacklogItem[] }) {
  const total = items.length;
  if (total === 0) return null;

  const active = items.filter((i) => i.status === "active").length;
  const finished = items.filter((i) => i.status === "finished").length;
  const queued = items.filter((i) => i.status === "backlog").length;
  const paused = items.filter((i) => i.status === "paused").length;
  const dropped = items.filter((i) => i.status === "dropped").length;

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const QUEUED_COLOR = "rgba(148,163,184,0.5)";

  const cardStyle = {
    background: "var(--color-bg-1)",
    border: "1px solid var(--rule-soft)",
    borderRadius: 10,
    padding: "12px 16px",
    minWidth: 88,
  };

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{total}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginTop: 2,
          }}
        >
          Total
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{active}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginTop: 2,
          }}
        >
          In Progress
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>{finished}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginTop: 2,
          }}
        >
          Finished
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-muted)" }}>
          {queued}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginTop: 2,
          }}
        >
          Queued
        </div>
      </div>

      {/* Progress card */}
      <div style={{ ...cardStyle, flex: 1, minWidth: 180 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Completion
        </div>
        <div
          style={{
            display: "flex",
            height: 6,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--color-bg-2)",
          }}
        >
          <div style={{ width: pct(finished), background: "#22c55e", transition: "width 0.3s" }} />
          <div
            style={{
              width: pct(active),
              background: "var(--color-primary)",
              transition: "width 0.3s",
            }}
          />
          <div style={{ width: pct(paused), background: "#f59e0b", transition: "width 0.3s" }} />
          <div style={{ width: pct(dropped), background: "#ef4444", transition: "width 0.3s" }} />
          <div style={{ width: pct(queued), background: QUEUED_COLOR, transition: "width 0.3s" }} />
        </div>
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
                  }}
                />
                {label} · {n}
              </span>
            ))}
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

function SearchModal({
  type,
  onClose,
  onImport,
}: {
  type: MediaType;
  onClose: () => void;
  onImport: (result: MetadataSearchResult) => Promise<void>;
}) {
  const searchType = type;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const res = await fetch(
            `/api/backlog/search?type=${searchType}&q=${encodeURIComponent(q)}`,
          );
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
    [searchType],
  );

  const labelMap: Record<string, string> = {
    game: "games",
    show: "shows",
    movie: "movies",
    book: "books",
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
        <div style={{ padding: "16px 16px 8px", display: "flex", gap: 8, alignItems: "center" }}>
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
          {results.map((r) => (
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
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                  {r.creator}
                  {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                </p>
              </div>
              <button
                disabled={importing === r.external_id}
                onClick={async () => {
                  setImporting(r.external_id);
                  await onImport(r);
                  setImporting(null);
                  onClose();
                }}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-on-primary, #fff)",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: importing === r.external_id ? "not-allowed" : "pointer",
                  opacity: importing === r.external_id ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {importing === r.external_id ? "Adding…" : "Add"}
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--rule-soft)" }}>
          <button
            onClick={async () => {
              if (!query.trim()) return;
              await onImport({
                external_id: "",
                external_source: "manual",
                title: query.trim(),
                creator: "",
                release_date: null,
                description: "",
                cover_url: "",
                metadata: {},
              });
              onClose();
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
}: {
  item: BacklogItem;
  showType?: boolean;
  draggable: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (targetId: string) => void;
}) {
  const genres = getGenres(item);

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
      </div>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 0",
          width: "100%",
          color: "var(--color-text-muted)",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title}
        <span
          style={{
            marginLeft: "auto",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
            fontSize: 12,
          }}
        >
          {count}
        </span>
      </button>
      {open && <div>{children}</div>}
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

export default function LibraryClient({ initialItems }: { initialItems: BacklogItem[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [items, setItems] = useState<BacklogItem[]>(initialItems);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [searchMediaType, setSearchMediaType] = useState<MediaType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // Items for the current tab (before filtering)
  const tabItems = useMemo(
    () => (activeTab === "all" ? items : items.filter((i) => i.media_type === activeTab)),
    [items, activeTab],
  );

  // Unique genres + years for filter dropdowns
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    tabItems.forEach((item) => getGenres(item).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [tabItems]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    tabItems.forEach((item) => {
      if (item.release_date) set.add(item.release_date.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [tabItems]);

  // Filtered + sorted items
  const filteredItems = useMemo(() => {
    let result = tabItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) => i.title.toLowerCase().includes(q) || (i.creator?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filterStatus) result = result.filter((i) => i.status === filterStatus);
    if (filterGenre) result = result.filter((i) => getGenres(i).includes(filterGenre));
    if (filterYear) result = result.filter((i) => i.release_date?.slice(0, 4) === filterYear);

    if (sortBy === "title") return [...result].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "rating") return [...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sortBy === "release_date")
      return [...result].sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
    return [...result].sort((a, b) => a.priority - b.priority);
  }, [tabItems, searchQuery, filterStatus, filterGenre, filterYear, sortBy]);

  const hasFilter = !!(searchQuery || filterStatus || filterGenre || filterYear);

  // Grouped by status
  const activeItems = filteredItems.filter((i) => i.status === "active");
  const queuedItems = filteredItems.filter((i) => i.status === "backlog");
  const pausedItems = filteredItems.filter((i) => i.status === "paused");
  const finishedItems = filteredItems.filter((i) => i.status === "finished");
  const droppedItems = filteredItems.filter((i) => i.status === "dropped");

  const canDrag = activeTab !== "all" && sortBy === "priority" && !hasFilter;
  const showType = activeTab === "all";

  const handleImport = async (result: MetadataSearchResult) => {
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
        status: "backlog",
      }),
    });
    if (res.ok) {
      const newItem = await res.json();
      setItems((prev) => [...prev, newItem as BacklogItem]);
      router.refresh();
      router.push(`/library/${(newItem as BacklogItem).id}`);
    }
  };

  const handleDragStart = (id: string) => {
    dragId.current = id;
  };
  const handleDragOver = (_e: React.DragEvent, id: string) => {
    dragOverId.current = id;
  };
  const handleDrop = async (targetId: string) => {
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) return;

    const tabList = items.filter((i) => i.media_type === activeTab);
    const srcIdx = tabList.findIndex((i) => i.id === srcId);
    const tgtIdx = tabList.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const reordered = [...tabList];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);

    const updated = reordered.map((item, idx) => ({ ...item, priority: idx }));
    const otherItems = items.filter((i) => i.media_type !== activeTab);
    setItems([...otherItems, ...updated]);

    await Promise.all(
      updated
        .filter((item, idx) => item.priority !== tabList[idx]?.priority)
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
        <button
          onClick={() => {
            if (activeTab === "all") {
              setShowTypePicker(true);
            } else {
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

      {/* Summary strip — shows stats for current tab */}
      <SummaryStrip items={tabItems} />

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
          const count =
            tab.id === "all" ? items.length : items.filter((i) => i.media_type === tab.id).length;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setFilterGenre(null);
                setFilterYear(null);
              }}
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

        {/* Genre filter */}
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

      {/* Empty state */}
      {tabItems.length === 0 && (
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
              else setSearchMediaType(activeTab);
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
      {tabItems.length > 0 && filteredItems.length === 0 && (
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

      {/* Item sections */}
      {filteredItems.length > 0 && (
        <div>
          {activeItems.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-text-muted)",
                  margin: "0 0 4px",
                }}
              >
                Active — {activeItems.length}
              </p>
              {activeItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showType={showType}
                  draggable={canDrag}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}

          <CollapsibleSection
            title="Queued"
            count={queuedItems.length}
            defaultOpen={activeItems.length === 0}
          >
            {queuedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showType={showType}
                draggable={canDrag}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Paused" count={pausedItems.length} defaultOpen={false}>
            {pausedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showType={showType}
                draggable={canDrag}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Finished" count={finishedItems.length} defaultOpen={false}>
            {finishedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showType={showType}
                draggable={false}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Dropped" count={droppedItems.length} defaultOpen={false}>
            {droppedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showType={showType}
                draggable={false}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </CollapsibleSection>
        </div>
      )}

      {/* Type picker — shown when adding from the All tab */}
      {showTypePicker && (
        <TypePickerModal
          onSelect={(type) => {
            setShowTypePicker(false);
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
        />
      )}
    </div>
  );
}
