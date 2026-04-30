"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, X, Trash2 } from "lucide-react";
import type { BacklogItem, BacklogSession, BacklogStatus } from "@/lib/types";

const STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];

const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--color-text-muted)",
  active: "var(--color-primary)",
  paused: "#f59e0b",
  finished: "#22c55e",
  dropped: "#ef4444",
};

const TYPE_LABEL: Record<string, string> = {
  game: "Game",
  show: "TV Show",
  movie: "Movie",
  book: "Book",
};

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: BacklogSession }) {
  const fmt = (ts: string | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--rule-soft)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--color-text-muted)", minWidth: 90 }}>
        {fmt(session.started_at)}
      </span>
      <span style={{ color: "var(--color-text-muted)" }}>→</span>
      <span style={{ color: "var(--color-text-muted)", minWidth: 90 }}>
        {fmt(session.finished_at)}
      </span>
      <span style={{ flex: 1, color: "var(--color-text)" }}>{session.notes ?? ""}</span>
    </div>
  );
}

// ── Add session form ──────────────────────────────────────────────────────────

function AddSessionForm({
  itemId,
  onAdded,
}: {
  itemId: string;
  onAdded: (session: BacklogSession) => void;
}) {
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/backlog/${itemId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        started_at: startedAt || null,
        finished_at: finishedAt || null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to add session");
      return;
    }
    const session = await res.json();
    onAdded(session as BacklogSession);
    setStartedAt("");
    setFinishedAt("");
    setNotes("");
  };

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Started
          </label>
          <input
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            style={{
              border: "1px solid var(--rule-soft)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              background: "var(--color-bg-1)",
              color: "var(--color-text)",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Finished
          </label>
          <input
            type="date"
            value={finishedAt}
            onChange={(e) => setFinishedAt(e.target.value)}
            style={{
              border: "1px solid var(--rule-soft)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              background: "var(--color-bg-1)",
              color: "var(--color-text)",
            }}
          />
        </div>
      </div>
      <input
        type="text"
        placeholder="Notes (e.g. 2nd playthrough, Nightmare difficulty)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{
          border: "1px solid var(--rule-soft)",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 13,
          background: "var(--color-bg-1)",
          color: "var(--color-text)",
          width: "100%",
        }}
      />
      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
      <button
        disabled={saving}
        onClick={submit}
        style={{
          alignSelf: "flex-start",
          background: "var(--color-primary)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "7px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : "Log session"}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BacklogDetailClient({
  item: initialItem,
  initialSessions,
  appUrl,
}: {
  item: BacklogItem;
  initialSessions: BacklogSession[];
  appUrl: string;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [sessions, setSessions] = useState(initialSessions);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState(
    item.share_token ? `${appUrl}/share/backlog/${item.share_token}` : "",
  );
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const patch = async (fields: Partial<BacklogItem>) => {
    setSaving(true);
    const res = await fetch(`/api/backlog/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setItem(updated as BacklogItem);
    }
  };

  const generateShare = async () => {
    const res = await fetch(`/api/backlog/${item.id}/share`, { method: "POST" });
    if (res.ok) {
      const { share_url } = await res.json();
      setShareUrl(share_url);
      setItem((prev) => ({ ...prev, share_token: share_url.split("/").pop() ?? null }));
    }
  };

  const revokeShare = async () => {
    await fetch(`/api/backlog/${item.id}/share`, { method: "DELETE" });
    setShareUrl("");
    setItem((prev) => ({ ...prev, share_token: null }));
  };

  const copyShare = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const deleteItem = async () => {
    if (!confirm(`Delete "${item.title}" from your backlog?`)) return;
    setDeleting(true);
    await fetch(`/api/backlog/${item.id}`, { method: "DELETE" });
    router.push("/backlog");
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Back nav */}
      <button
        onClick={() => router.push("/backlog")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-muted)",
          fontSize: 13,
          marginBottom: 20,
          padding: 0,
        }}
      >
        <ArrowLeft size={14} /> Back to Backlog
      </button>

      {/* Header */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 28 }}>
        {item.cover_url && (
          <img
            src={item.cover_url}
            alt={item.title}
            width={96}
            height={136}
            style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
            }}
          >
            {TYPE_LABEL[item.media_type] ?? item.media_type}
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 4px", lineHeight: 1.2 }}>
            {item.title}
          </h1>
          {item.creator && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>
              {item.creator}
              {item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ""}
            </p>
          )}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={deleteItem}
              disabled={deleting}
              style={{
                background: "none",
                border: "1px solid var(--rule-soft)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: deleting ? "not-allowed" : "pointer",
                color: "#ef4444",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Trash2 size={12} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            marginBottom: 24,
          }}
        >
          {item.description}
        </p>
      )}

      {/* Status */}
      <section style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
            marginBottom: 8,
          }}
        >
          Status
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUSES.map((s) => {
            const isActive = item.status === s;
            return (
              <button
                key={s}
                onClick={() => patch({ status: s })}
                disabled={saving}
                style={{
                  border: `1px solid ${isActive ? STATUS_COLORS[s] : "var(--rule-soft)"}`,
                  borderRadius: 999,
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: isActive ? STATUS_COLORS[s] : "none",
                  color: isActive ? "#fff" : "var(--color-text)",
                  textTransform: "capitalize",
                  transition: "all 0.15s",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </section>

      {/* Rating + Review */}
      <section
        style={{ marginBottom: 24, borderBottom: "1px solid var(--rule-soft)", paddingBottom: 24 }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
            marginBottom: 12,
          }}
        >
          Rating & Review
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            defaultValue={item.rating ?? ""}
            placeholder="0–10"
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0 && val <= 10) patch({ rating: val });
              else if (e.target.value === "") patch({ rating: null as unknown as number });
            }}
            style={{
              width: 80,
              border: "1px solid var(--rule-soft)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 15,
              fontWeight: 700,
              background: "var(--color-bg-1)",
              color: "var(--color-text)",
            }}
          />
          <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>/ 10</span>
        </div>
        <textarea
          defaultValue={item.review ?? ""}
          placeholder="Write a review…"
          rows={4}
          onBlur={(e) => patch({ review: e.target.value || (null as unknown as string) })}
          style={{
            width: "100%",
            border: "1px solid var(--rule-soft)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 14,
            lineHeight: 1.5,
            background: "var(--color-bg-1)",
            color: "var(--color-text)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </section>

      {/* Sessions */}
      <section
        style={{ marginBottom: 24, borderBottom: "1px solid var(--rule-soft)", paddingBottom: 24 }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
            marginBottom: 8,
          }}
        >
          Sessions — {sessions.length}
        </p>
        {sessions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
        <AddSessionForm itemId={item.id} onAdded={(s) => setSessions((prev) => [s, ...prev])} />
      </section>

      {/* Share */}
      <section style={{ marginBottom: 32 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-muted)",
            marginBottom: 12,
          }}
        >
          Share
        </p>
        {shareUrl ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--rule-soft)",
                borderRadius: 6,
                padding: "8px 12px",
                background: "var(--color-bg-1)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--color-text-muted)",
                }}
              >
                {shareUrl}
              </span>
              <button
                onClick={copyShare}
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 5,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={revokeShare}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                color: "#ef4444",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                alignSelf: "flex-start",
              }}
            >
              <X size={13} /> Stop sharing
            </button>
          </div>
        ) : (
          <button
            onClick={generateShare}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: "none",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <Share2 size={15} /> Generate share link
          </button>
        )}
      </section>
    </div>
  );
}
