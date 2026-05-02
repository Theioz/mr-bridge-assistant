"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, X, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import type { BacklogItem, BacklogStatus, MediaType, MetadataSearchResult } from "@/lib/types";

interface ImportExtras {
  status: BacklogStatus;
  rating: number | null;
  review: string | null;
  platform: string | null;
  price_paid: number | null;
  session: { started_at: string | null; finished_at: string | null; notes: string | null } | null;
}

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

const BACKLOG_STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];
const BACKLOG_STATUS_COLORS: Record<string, string> = {
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
  type: Tab;
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
  const [prePlatform, setPrePlatform] = useState("");
  const [prePricePaid, setPrePricePaid] = useState("");
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

  const openPreAdd = (r: MetadataSearchResult) => {
    setSelected(r);
    setPreStatus("backlog");
    setPreRating("");
    setPreReview("");
    setPrePlatform("");
    setPrePricePaid("");
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
      platform: prePlatform || null,
      price_paid: prePricePaid ? parseFloat(prePricePaid) : null,
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
            {/* Search input */}
            <div
              style={{ padding: "16px 16px 8px", display: "flex", gap: 8, alignItems: "center" }}
            >
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
                          Already in backlog
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => openPreAdd(r)}
                      style={{
                        background: "var(--color-primary)",
                        color: "#fff",
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

            {/* Manual add footer */}
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
                Add to Backlog
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
                  <strong>Already in your backlog.</strong>{" "}
                  <a
                    href={`/backlog/${existingMap.get(selected.external_id)}`}
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
                  {BACKLOG_STATUSES.map((s) => {
                    const active = preStatus === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setPreStatus(s)}
                        style={{
                          border: `1px solid ${active ? BACKLOG_STATUS_COLORS[s] : "var(--rule-soft)"}`,
                          borderRadius: 999,
                          padding: "4px 12px",
                          fontSize: 12,
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          background: active ? BACKLOG_STATUS_COLORS[s] : "none",
                          color: active ? "#fff" : "var(--color-text)",
                          textTransform: "capitalize",
                        }}
                      >
                        {s}
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

              {/* Console (games only) */}
              {type === "game" && (
                <div>
                  <label style={labelStyle}>Console / Platform</label>
                  <input
                    type="text"
                    placeholder="e.g. PS5, PC, Switch"
                    value={prePlatform}
                    onChange={(e) => setPrePlatform(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Price paid (games + books) */}
              {(type === "game" || type === "book") && (
                <div>
                  <label style={labelStyle}>Price Paid ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={prePricePaid}
                    onChange={(e) => setPrePricePaid(e.target.value)}
                    style={{ ...inputStyle, width: "auto", maxWidth: 120 }}
                  />
                </div>
              )}

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
                  color: "#fff",
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
      <Link
        href={`/backlog/${item.id}`}
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
          {item.creator && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {item.creator}
              {item.release_date
                ? ` · ${(() => {
                    const startYear = item.release_date!.slice(0, 4);
                    if (item.media_type !== "show") return startYear;
                    const meta = item.metadata as Record<string, unknown> | null;
                    const inProd = meta?.in_production as boolean | undefined;
                    const lastAir = meta?.last_air_date as string | undefined;
                    if (inProd) return `${startYear}–present`;
                    if (lastAir) {
                      const endYear = lastAir.slice(0, 4);
                      return endYear !== startYear ? `${startYear}–${endYear}` : startYear;
                    }
                    return startYear;
                  })()}`
                : ""}
              {item.media_type === "game" &&
              (item.metadata as Record<string, unknown> | null)?.played_on
                ? ` · ${String((item.metadata as Record<string, unknown>).played_on)}`
                : ""}
            </p>
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("game");
  const [items, setItems] = useState<BacklogItem[]>(initialItems);
  const [showSearch, setShowSearch] = useState(false);
  const [existingItemsSnapshot, setExistingItemsSnapshot] = useState<BacklogItem[]>([]);
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  const tabItems = items.filter((i) => i.media_type === activeTab);
  const activeItems = tabItems.filter((i) => i.status === "active");
  const backlogItems = tabItems.filter((i) => i.status === "backlog");
  const finishedItems = tabItems.filter((i) =>
    ["finished", "dropped", "paused"].includes(i.status),
  );

  // Import a search result as a new backlog item
  const handleImport = async (result: MetadataSearchResult, extras: ImportExtras) => {
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
        status: extras.status,
        rating: extras.rating,
        review: extras.review,
      }),
    });
    if (!res.ok) return;
    const newItem = (await res.json()) as BacklogItem;
    setItems((prev) => [...prev, newItem]);
    if (extras.session) {
      await fetch(`/api/backlog/${newItem.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extras.session),
      });
    }
    router.push(`/backlog/${newItem.id}`);
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
          onClick={() => {
            setExistingItemsSnapshot(items);
            setShowSearch(true);
          }}
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
            onClick={() => {
              setExistingItemsSnapshot(items);
              setShowSearch(true);
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
          existingItems={existingItemsSnapshot}
        />
      )}
    </div>
  );
}
