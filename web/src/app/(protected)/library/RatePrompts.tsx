"use client";

import { useState } from "react";
import Link from "next/link";
import type { BacklogItem } from "@/lib/types";

// Rate prompts raised by the Plex watch sync (#691): a finished movie, or a show watched
// to the end of its final season. Saving a rating clears the prompt in the database
// (trigger on backlog_items); Dismiss clears it without one.

function PromptRow({ item, onDone }: { item: BacklogItem; onDone: (id: string) => void }) {
  const [rating, setRating] = useState("0");
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = rating === "0" ? null : parseFloat(rating);

  const send = async (fields: Partial<BacklogItem>) => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/backlog/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    if (res.ok) onDone(item.id);
    else setError("Could not save — try again");
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 0",
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      {item.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_url}
          alt=""
          width={44}
          height={66}
          style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <Link
            href={`/library/${item.id}`}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text)",
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.title}
          </Link>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 18,
              fontWeight: 700,
              color: parsed ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
          >
            {parsed != null ? parsed.toFixed(1) : "—"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={rating}
          aria-label={`Rating for ${item.title}`}
          onChange={(e) => setRating(e.target.value)}
          style={{ width: "100%", accentColor: "var(--color-primary)", cursor: "pointer" }}
        />
        <textarea
          value={review}
          placeholder="Review (optional)"
          rows={2}
          onChange={(e) => setReview(e.target.value)}
          style={{
            width: "100%",
            marginTop: 6,
            border: "1px solid var(--rule-soft)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            background: "transparent",
            color: "var(--color-text)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
          <button
            disabled={saving || parsed == null}
            onClick={() => send({ rating: parsed, review: review.trim() || null })}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              background: "var(--color-primary)",
              color: "var(--color-text-on-cta)",
              cursor: saving || parsed == null ? "not-allowed" : "pointer",
              opacity: saving || parsed == null ? 0.5 : 1,
            }}
          >
            Save rating
          </button>
          <button
            disabled={saving}
            onClick={() => send({ rate_prompt_at: null })}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid var(--rule-soft)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Dismiss
          </button>
          {error && <span style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}

export default function RatePrompts({ initialItems }: { initialItems: BacklogItem[] }) {
  const [items, setItems] = useState(initialItems);
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Rate what you watched"
      style={{
        marginBottom: 20,
        padding: "12px 16px 4px",
        border: "1px solid var(--rule-soft)",
        borderRadius: 8,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
        Watched on Plex — rate {items.length === 1 ? "it" : `these ${items.length}`}?
      </p>
      {items.map((item) => (
        <PromptRow
          key={item.id}
          item={item}
          onDone={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
      ))}
    </section>
  );
}
