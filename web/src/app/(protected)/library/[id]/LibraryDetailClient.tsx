"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, X, Trash2 } from "lucide-react";
import type { BacklogItem, BacklogSession, BacklogStatus } from "@/lib/types";

const STATUSES: BacklogStatus[] = ["backlog", "active", "paused", "finished", "dropped"];

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

const TYPE_LABEL: Record<string, string> = {
  game: "Game",
  show: "TV Show",
  movie: "Movie",
  book: "Book",
};

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onDelete,
}: {
  session: BacklogSession;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const fmt = (ts: string | null) => {
    if (!ts) return "—";
    const [y, m, d] = ts.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/backlog/${session.item_id}/sessions/${session.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDelete(session.id);
    else setDeleting(false);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--rule-soft)",
        fontSize: 13,
        alignItems: "center",
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
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete session"
        style={{
          background: "none",
          border: "none",
          cursor: deleting ? "not-allowed" : "pointer",
          color: "var(--color-text-muted)",
          padding: "2px 4px",
          opacity: deleting ? 0.4 : 0.6,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Trash2 size={13} />
      </button>
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

  const inputStyle = {
    border: "1px solid var(--rule-soft)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    background: "var(--color-bg-1)",
    color: "var(--color-text)",
  };

  const labelStyle = {
    fontSize: 11,
    color: "var(--color-text-muted)",
    fontWeight: 600 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  };

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={labelStyle}>Started</label>
          <input
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={labelStyle}>Finished</label>
          <input
            type="date"
            value={finishedAt}
            onChange={(e) => setFinishedAt(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      <input
        type="text"
        placeholder="Notes (e.g. 2nd playthrough, Nightmare difficulty)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      />
      {error && <p style={{ color: "var(--color-danger, #ef4444)", fontSize: 13 }}>{error}</p>}
      <button
        disabled={saving}
        onClick={submit}
        style={{
          alignSelf: "flex-start",
          background: "var(--color-primary)",
          color: "var(--color-text-on-primary, #fff)",
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

export default function LibraryDetailClient({
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
  const [draftStatus, setDraftStatus] = useState(initialItem.status);
  const [draftRating, setDraftRating] = useState(
    initialItem.rating != null ? String(initialItem.rating) : "0",
  );
  const [draftReview, setDraftReview] = useState(initialItem.review ?? "");
  const [draftPaidPrice, setDraftPaidPrice] = useState(
    String((initialItem.metadata as Record<string, unknown>)?.paid_price ?? ""),
  );
  const [draftPlayedOn, setDraftPlayedOn] = useState(
    String((initialItem.metadata as Record<string, unknown>)?.played_on ?? ""),
  );
  const [shareUrl, setShareUrl] = useState(
    item.share_token ? `${appUrl}/share/backlog/${item.share_token}` : "",
  );
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parsedDraftRating =
    draftRating === "" || draftRating === "0" ? null : parseFloat(draftRating);
  const currentPaidPrice = String((item.metadata as Record<string, unknown>)?.paid_price ?? "");
  const hasChanges =
    draftStatus !== item.status ||
    parsedDraftRating !== item.rating ||
    (draftReview || null) !== item.review ||
    ((item.media_type === "game" || item.media_type === "book") &&
      draftPaidPrice !== currentPaidPrice) ||
    (item.media_type === "game" &&
      draftPlayedOn !== String((item.metadata as Record<string, unknown>)?.played_on ?? ""));

  const patch = async (fields: Partial<BacklogItem>) => {
    setSaving(true);
    const res = await fetch(`/api/backlog/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    if (res.ok) {
      const updated = (await res.json()) as BacklogItem;
      setItem(updated);
      setDraftStatus(updated.status);
      setDraftRating(updated.rating != null ? String(updated.rating) : "0");
      setDraftReview(updated.review ?? "");
      setDraftPaidPrice(String((updated.metadata as Record<string, unknown>)?.paid_price ?? ""));
      setDraftPlayedOn(String((updated.metadata as Record<string, unknown>)?.played_on ?? ""));
    }
  };

  const saveChanges = async () => {
    const fields: Partial<BacklogItem> = {
      status: draftStatus,
      rating: parsedDraftRating,
      review: draftReview || null,
    };
    if (item.media_type === "game" || item.media_type === "book") {
      const meta = { ...((item.metadata as Record<string, unknown>) ?? {}) };
      meta.paid_price = draftPaidPrice ? parseFloat(draftPaidPrice) : null;
      if (item.media_type === "game") meta.played_on = draftPlayedOn || null;
      fields.metadata = meta as BacklogItem["metadata"];
    }
    await patch(fields);
  };

  const revertChanges = () => {
    setDraftStatus(item.status);
    setDraftRating(item.rating != null ? String(item.rating) : "0");
    setDraftReview(item.review ?? "");
    setDraftPaidPrice(String((item.metadata as Record<string, unknown>)?.paid_price ?? ""));
    setDraftPlayedOn(String((item.metadata as Record<string, unknown>)?.played_on ?? ""));
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
    if (!confirm(`Delete "${item.title}" from your library?`)) return;
    setDeleting(true);
    await fetch(`/api/backlog/${item.id}`, { method: "DELETE" });
    router.push("/library");
  };

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 600 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--color-text-muted)",
    marginBottom: 8,
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Back nav */}
      <button
        onClick={() => router.back()}
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
        <ArrowLeft size={14} /> Back to Library
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
          <div style={{ marginTop: 10 }}>
            <button
              onClick={deleteItem}
              disabled={deleting}
              style={{
                background: "none",
                border: "1px solid var(--rule-soft)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: deleting ? "not-allowed" : "pointer",
                color: "var(--color-danger, #ef4444)",
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
        <p style={sectionLabel}>Status</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUSES.map((s) => {
            const isActive = draftStatus === s;
            return (
              <button
                key={s}
                onClick={() => setDraftStatus(s)}
                disabled={saving}
                style={{
                  border: `1px solid ${isActive ? STATUS_COLORS[s] : "var(--rule-soft)"}`,
                  borderRadius: 999,
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: isActive ? STATUS_COLORS[s] : "none",
                  color: isActive ? "var(--color-text-on-primary, #fff)" : "var(--color-text)",
                  textTransform: "capitalize",
                  transition: "all 0.15s",
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Rating + Review */}
      <section
        style={{ marginBottom: 24, borderBottom: "1px solid var(--rule-soft)", paddingBottom: 24 }}
      >
        <p style={{ ...sectionLabel, marginBottom: 12 }}>Rating & Review</p>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: parsedDraftRating ? "var(--color-primary)" : "var(--color-text-muted)",
                minWidth: 48,
              }}
            >
              {parsedDraftRating != null ? parsedDraftRating.toFixed(1) : "—"}
            </span>
            <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>/ 10</span>
            {parsedDraftRating != null && (
              <button
                onClick={() => setDraftRating("0")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textDecoration: "underline",
                  marginLeft: 4,
                }}
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={draftRating || 0}
            onChange={(e) => setDraftRating(e.target.value)}
            style={{ width: "100%", accentColor: "var(--color-primary)", cursor: "pointer" }}
          />
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
        <textarea
          value={draftReview}
          placeholder="Write a review…"
          rows={4}
          onChange={(e) => setDraftReview(e.target.value)}
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

        {/* Paid price — games + books only */}
        {(item.media_type === "game" || item.media_type === "book") && (
          <div style={{ marginTop: 16 }}>
            <p style={{ ...sectionLabel, marginBottom: 6 }}>Paid</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={draftPaidPrice}
                onChange={(e) => setDraftPaidPrice(e.target.value)}
                style={{
                  width: 100,
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 14,
                  background: "var(--color-bg-1)",
                  color: "var(--color-text)",
                }}
              />
            </div>
          </div>
        )}

        {/* Played on — games only */}
        {item.media_type === "game" && (
          <div style={{ marginTop: 16 }}>
            <p style={{ ...sectionLabel, marginBottom: 6 }}>Played on</p>
            {(() => {
              const availablePlatforms = String(
                (item.metadata as Record<string, unknown>)?.platform ?? "",
              )
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              return (
                <>
                  {availablePlatforms.length > 0 && (
                    <datalist id="platforms-list">
                      {availablePlatforms.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  )}
                  <input
                    type="text"
                    list={availablePlatforms.length > 0 ? "platforms-list" : undefined}
                    placeholder="e.g. PS5, Nintendo Switch"
                    value={draftPlayedOn}
                    onChange={(e) => setDraftPlayedOn(e.target.value)}
                    style={{
                      width: "100%",
                      border: "1px solid var(--rule-soft)",
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 14,
                      background: "var(--color-bg-1)",
                      color: "var(--color-text)",
                    }}
                  />
                  {availablePlatforms.length > 0 && (
                    <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                      Available on: {availablePlatforms.join(", ")}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </section>

      {/* Save / Revert bar */}
      {hasChanges && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "var(--color-bg-0, var(--color-bg-1))",
            borderTop: "1px solid var(--rule-soft)",
            padding: "12px 0",
            display: "flex",
            gap: 8,
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <button
            disabled={saving}
            onClick={saveChanges}
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-on-primary, #fff)",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={revertChanges}
            style={{
              background: "none",
              border: "1px solid var(--rule-soft)",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--color-text-muted)",
            }}
          >
            Revert
          </button>
        </div>
      )}

      {/* Sessions */}
      <section
        style={{ marginBottom: 24, borderBottom: "1px solid var(--rule-soft)", paddingBottom: 24 }}
      >
        <p style={sectionLabel}>Sessions — {sessions.length}</p>
        {sessions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onDelete={(id) => setSessions((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
        <AddSessionForm itemId={item.id} onAdded={(s) => setSessions((prev) => [s, ...prev])} />
      </section>

      {/* Share */}
      <section style={{ marginBottom: 32 }}>
        <p style={sectionLabel}>Share</p>
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
                  color: "var(--color-text-on-primary, #fff)",
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
                color: "var(--color-danger, #ef4444)",
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
