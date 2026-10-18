"use client";

import { X } from "lucide-react";
import type { MediaType } from "@/lib/types";

// ── Type picker modal ─────────────────────────────────────────────────────────

const TYPE_OPTIONS: { id: MediaType; label: string; emoji: string }[] = [
  { id: "game", label: "Game", emoji: "🎮" },
  { id: "show", label: "Show", emoji: "📺" },
  { id: "movie", label: "Movie", emoji: "🎬" },
  { id: "book", label: "Book", emoji: "📖" },
];

export default function TypePickerModal({
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
          boxShadow: "var(--shadow-lg)",
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
              className="hover-border-strong hover-bg-raised"
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
