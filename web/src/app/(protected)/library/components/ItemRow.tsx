"use client";

import { useState } from "react";
import Link from "next/link";
import { GripVertical, Trash2 } from "lucide-react";
import type { BacklogItem } from "@/lib/types";
import { MEDIA_LABELS, STATUS_COLORS, STATUS_LABELS, getGenres } from "../shared";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: "var(--t-micro)",
        color: "var(--color-text-muted)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: STATUS_COLORS[status] ?? "var(--color-text-faint)",
          flexShrink: 0,
        }}
      />
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

// ── Item row ──────────────────────────────────────────────────────────────────

export default function ItemRow({
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
              fontWeight: 500,
              fontSize: "var(--t-meta)",
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.title}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
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
          {(genres.length > 0 || showType) && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
              {showType && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-1)",
                    padding: "1px 6px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
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
                    border: "1px solid var(--rule-soft)",
                    borderRadius: "var(--r-1)",
                    padding: "1px 6px",
                    color: "var(--color-text-faint)",
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
          <span
            className="tnum"
            style={{ fontSize: "var(--t-micro)", fontWeight: 600, color: "var(--accent-text)" }}
          >
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
