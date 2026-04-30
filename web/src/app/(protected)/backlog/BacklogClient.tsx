"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, Plus, X, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import type { BacklogItem, MediaType, MetadataSearchResult } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = MediaType;

const TABS: { id: Tab; label: string }[] = [
  { id: "game", label: "Games" },
  { id: "show", label: "Shows" },
  { id: "movie", label: "Movies" },
  { id: "book", label: "Books" },
];

const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--color-text-muted)",
  active: "var(--color-primary)",
  paused: "#f59e0b",
  finished: "#22c55e",
  dropped: "#ef4444",
};

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
        textTransform: "capitalize",
        color: "#fff",
        background: STATUS_COLORS[status] ?? "#666",
      }}
    >
      {status}
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
          fontSize: 18,
        }}
      >
        📦
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

// ── Search modal ──────────────────────────────────────────────────────────────

function SearchModal({
  type,
  onClose,
  onImport,
}: {
  type: Tab;
  onClose: () => void;
  onImport: (result: MetadataSearchResult) => Promise<void>;
}) {
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.6)",
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
        }}
      >
        {/* Search input */}
        <div style={{ padding: "16px 16px 8px", display: "flex", gap: 8, alignItems: "center" }}>
          <Search size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
          <input
            autoFocus
            type="text"
            placeholder={`Search ${type}s…`}
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

        {/* Results */}
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
            <p style={{ padding: 20, color: "#ef4444", fontSize: 14 }}>{error}</p>
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
                  color: "#fff",
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

        {/* Manual add footer */}
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
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: BacklogItem;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (targetId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, item.id);
      }}
      onDrop={(e) => {
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
      <GripVertical
        size={14}
        style={{ color: "var(--color-text-muted)", flexShrink: 0, cursor: "grab" }}
      />
      <CoverThumb url={item.cover_url} title={item.title} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/backlog/${item.id}`}
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--color-text)",
            textDecoration: "none",
          }}
        >
          {item.title}
        </Link>
        {item.creator && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            {item.creator}
            {item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ""}
          </p>
        )}
      </div>
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
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
        <span
          style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
        >
          {count}
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BacklogClient({ initialItems }: { initialItems: BacklogItem[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("game");
  const [items, setItems] = useState<BacklogItem[]>(initialItems);
  const [showSearch, setShowSearch] = useState(false);
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  const tabItems = items.filter((i) => i.media_type === activeTab);
  const activeItems = tabItems.filter((i) => i.status === "active");
  const backlogItems = tabItems.filter((i) => i.status === "backlog");
  const finishedItems = tabItems.filter((i) =>
    ["finished", "dropped", "paused"].includes(i.status),
  );

  // Import a search result as a new backlog item
  const handleImport = async (result: MetadataSearchResult) => {
    const res = await fetch("/api/backlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: activeTab,
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
    }
  };

  // Drag-to-reorder
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

    // Assign new priorities
    const updated = reordered.map((item, idx) => ({ ...item, priority: idx }));
    // Merge back into full list
    const otherItems = items.filter((i) => i.media_type !== activeTab);
    setItems([...otherItems, ...updated]);

    // Persist each changed priority
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

  const totalCount = tabItems.length;

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Backlog</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Track what you want to play, watch, and read
          </p>
        </div>
        <button
          onClick={() => setShowSearch(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--color-primary)",
            color: "#fff",
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

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        {TABS.map((tab) => {
          const count = items.filter((i) => i.media_type === tab.id).length;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 16px",
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
                    marginLeft: 6,
                    fontSize: 11,
                    background: isActive ? "var(--color-primary)" : "var(--color-bg-2)",
                    color: isActive ? "#fff" : "var(--color-text-muted)",
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

      {/* Content */}
      {totalCount === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 15 }}>
            No {TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} tracked yet.
          </p>
          <button
            onClick={() => setShowSearch(true)}
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
      ) : (
        <div>
          {activeItems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
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
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}

          {backlogItems.length > 0 && (
            <CollapsibleSection
              title="Backlog"
              count={backlogItems.length}
              defaultOpen={activeItems.length === 0}
            >
              {backlogItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </CollapsibleSection>
          )}

          {finishedItems.length > 0 && (
            <CollapsibleSection
              title="Finished / Dropped"
              count={finishedItems.length}
              defaultOpen={false}
            >
              {finishedItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Search modal */}
      {showSearch && (
        <SearchModal
          type={activeTab}
          onClose={() => setShowSearch(false)}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
