"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, X, Check, AlertTriangle, SkipForward, Library } from "lucide-react";
import {
  ImportParseError,
  OUTCOME_LABELS,
  parseMediaCsv,
  type ParsedImportRow,
  type ResolveOutcome,
  type ResolvedRow,
} from "@/lib/import/media-csv";
import type { BacklogItem } from "@/lib/types";

// Rows per resolve request. Small enough that a chunk returns quickly and the progress
// bar moves; large enough that a 500-row export is 20 requests, not 500.
const CHUNK = 25;

type Stage = "pick" | "resolving" | "preview" | "committing" | "done";

const OUTCOME_COLORS: Record<ResolveOutcome, string> = {
  matched: "var(--color-positive)",
  duplicate: "var(--color-text-muted)",
  unmatched: "var(--color-danger)",
  skipped: "var(--color-amber)",
};

const OUTCOME_ICONS: Record<ResolveOutcome, typeof Check> = {
  matched: Check,
  duplicate: Library,
  unmatched: AlertTriangle,
  skipped: SkipForward,
};

interface CommitResult {
  inserted: BacklogItem[];
  skipped: { title: string; existing_id?: string }[];
}

export default function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (inserted: BacklogItem[]) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  // Lines the user unticked in the preview — dropped rather than imported.
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<CommitResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<ResolveOutcome, number> = {
      matched: 0,
      duplicate: 0,
      unmatched: 0,
      skipped: 0,
    };
    for (const r of resolved) c[r.outcome]++;
    return c;
  }, [resolved]);

  const selected = useMemo(
    () => resolved.filter((r) => r.outcome === "matched" && !dropped.has(r.line)),
    [resolved, dropped],
  );

  const resolveAll = useCallback(async (rows: ParsedImportRow[]) => {
    setStage("resolving");
    setProgress({ done: 0, total: rows.length });
    const all: ResolvedRow[] = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const res = await fetch("/api/backlog/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: chunk }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Lookup failed (${res.status})`);
        setStage("pick");
        return;
      }
      const data = (await res.json()) as { resolved: ResolvedRow[] };
      all.push(...data.resolved);
      setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      // Show rows as they land so a long import is not a blank wait.
      setResolved([...all]);
    }

    setStage("preview");
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      setResolved([]);
      setDropped(new Set());
      setFileName(file.name);
      try {
        const { rows } = parseMediaCsv(await file.text());
        if (rows.length === 0) {
          setError("That file has no rows.");
          return;
        }
        await resolveAll(rows);
      } catch (err) {
        setError(err instanceof ImportParseError ? err.message : "Could not read that file.");
        setStage("pick");
      }
    },
    [resolveAll],
  );

  const commit = async () => {
    setStage("committing");
    setError("");
    const res = await fetch("/api/backlog/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: selected.map((r) => r.item) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Import failed (${res.status})`);
      setStage("preview");
      return;
    }
    const data = (await res.json()) as CommitResult;
    setResult(data);
    onImported(data.inserted);
    setStage("done");
  };

  const toggle = (line: number) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from a CSV export"
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
        paddingTop: 48,
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "resolving" && stage !== "committing")
          onClose();
      }}
    >
      <div
        style={{
          background: "var(--color-bg-1)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 720,
          maxHeight: "calc(100vh - 96px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Import from IMDb</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {fileName || "A ratings, watchlist, or list export (.csv)"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={stage === "resolving" || stage === "committing"}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: stage === "resolving" || stage === "committing" ? "not-allowed" : "pointer",
              padding: 4,
              color: "var(--color-text-muted)",
              opacity: stage === "resolving" || stage === "committing" ? 0.4 : 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {error && (
            <p
              role="alert"
              style={{
                margin: "0 0 12px",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--color-danger)",
                background: "var(--color-danger-subtle)",
                border: "1px solid var(--color-danger)",
              }}
            >
              {error}
            </p>
          )}

          {stage === "pick" && (
            <div style={{ textAlign: "center", padding: "24px 8px" }}>
              <Upload size={28} style={{ color: "var(--color-text-muted)", marginBottom: 10 }} />
              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
                Choose your IMDb CSV export
              </p>
              <p
                style={{
                  margin: "0 auto 16px",
                  fontSize: 12.5,
                  color: "var(--color-text-muted)",
                  maxWidth: 420,
                  lineHeight: 1.5,
                }}
              >
                Every title is matched by its IMDb id, so nothing is guessed. Rated titles come in
                as finished with their rating; unrated ones join the queue. You will see the whole
                list before anything is saved.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset so re-picking the same file after an error still fires onChange.
                  e.target.value = "";
                  if (file) handleFile(file);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-on-cta)",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Choose file
              </button>
            </div>
          )}

          {stage === "resolving" && (
            <div style={{ padding: "24px 8px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
                Matching {progress.done} of {progress.total} titles…
              </p>
              <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--color-bg-2)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "var(--color-primary)",
                    transition: "width 0.25s",
                  }}
                />
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  textAlign: "center",
                }}
              >
                Nothing is saved yet.
              </p>
            </div>
          )}

          {(stage === "preview" || stage === "committing") && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {(Object.keys(OUTCOME_LABELS) as ResolveOutcome[]).map((outcome) => (
                  <div
                    key={outcome}
                    style={{
                      background: "var(--color-bg-2)",
                      border: "1px solid var(--rule-soft)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        color: OUTCOME_COLORS[outcome],
                      }}
                    >
                      {counts[outcome]}
                    </p>
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                      {OUTCOME_LABELS[outcome]}
                    </p>
                  </div>
                ))}
              </div>

              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-text-muted)" }}>
                Untick anything you would rather not import. Rows that are already in your library
                or could not be matched are listed so you can add them by hand — they are never
                imported.
              </p>

              <div
                style={{
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {resolved.map((row, i) => {
                  const Icon = OUTCOME_ICONS[row.outcome];
                  const importable = row.outcome === "matched";
                  const checked = importable && !dropped.has(row.line);
                  const item = row.item as Record<string, unknown> | undefined;
                  const year =
                    typeof item?.release_date === "string" ? item.release_date.slice(0, 4) : "";
                  const rating = item?.rating as number | null | undefined;

                  return (
                    <label
                      key={`${row.line}-${row.external_ref}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "7px 10px",
                        borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                        background: i % 2 ? "var(--color-bg-2)" : "transparent",
                        cursor: importable ? "pointer" : "default",
                        opacity: importable ? 1 : 0.6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!importable || stage === "committing"}
                        onChange={() => toggle(row.line)}
                        style={{ cursor: importable ? "pointer" : "not-allowed" }}
                      />
                      <Icon
                        size={14}
                        style={{ color: OUTCOME_COLORS[row.outcome], flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {(item?.title as string) || row.source_title}
                        {year && (
                          <span style={{ color: "var(--color-text-muted)" }}> ({year})</span>
                        )}
                      </span>
                      {rating != null && (
                        <span
                          style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}
                        >
                          {rating}/10
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11.5,
                          color: OUTCOME_COLORS[row.outcome],
                          flexShrink: 0,
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.reason ?? OUTCOME_LABELS[row.outcome]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {stage === "done" && result && (
            <div style={{ padding: "16px 8px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>
                Added {result.inserted.length} {result.inserted.length === 1 ? "title" : "titles"}{" "}
                to your library.
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
                {counts.duplicate + result.skipped.length} already present · {counts.unmatched} not
                found on TMDB · {counts.skipped} skipped
              </p>
              {counts.unmatched > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 600 }}>
                    Not found — add these by hand:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12.5,
                      color: "var(--color-text-muted)",
                      maxHeight: 160,
                      overflowY: "auto",
                    }}
                  >
                    {resolved
                      .filter((r) => r.outcome === "unmatched")
                      .map((r) => (
                        <li key={r.line}>
                          {r.source_title} <span style={{ opacity: 0.6 }}>({r.external_ref})</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(stage === "preview" || stage === "committing" || stage === "done") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "12px 16px",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {stage === "done"
                ? "Done."
                : `${selected.length} of ${counts.matched} ready to import`}
            </span>
            {stage === "done" ? (
              <button
                onClick={onClose}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-on-cta)",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            ) : (
              <button
                onClick={commit}
                disabled={selected.length === 0 || stage === "committing"}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-on-cta)",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor:
                    selected.length === 0 || stage === "committing" ? "not-allowed" : "pointer",
                  opacity: selected.length === 0 || stage === "committing" ? 0.5 : 1,
                }}
              >
                {stage === "committing" ? "Importing…" : `Import ${selected.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
