"use client";

import { useState, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import type { BacklogItem, BacklogStatus, MediaType, MetadataSearchResult } from "@/lib/types";
import { STATUS_COLORS, type ImportExtras } from "../shared";

// ── Search modal ──────────────────────────────────────────────────────────────

const LIB_STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];
const LIB_STATUS_LABELS: Record<string, string> = {
  backlog: "Queued",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
};
const LIB_STATUS_COLORS: Record<string, string> = STATUS_COLORS;

export default function SearchModal({
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
          boxShadow: "var(--shadow-lg)",
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
                <p style={{ padding: 20, color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
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
                        <span
                          style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 600 }}
                        >
                          Already in library
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => openPreAdd(r)}
                      style={{
                        background: "var(--color-primary)",
                        color: "var(--color-text-on-cta)",
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
                    background: "var(--warning-subtle-strong)",
                    border: "1px solid var(--color-cta-subtle-strong)",
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
                          color: active ? "var(--color-text-on-cta)" : "var(--color-text)",
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
                  color: "var(--color-text-on-cta)",
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
