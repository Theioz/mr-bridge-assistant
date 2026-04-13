"use client";

import { Plus, X } from "lucide-react";
import type { SessionPreview } from "@/app/api/chat/sessions/route";

interface Props {
  open: boolean;
  sessions: SessionPreview[];
  activeSessionId: string;
  onClose: () => void;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;
}

function formatSessionDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export default function SessionSheet({
  open,
  sessions,
  activeSessionId,
  onClose,
  onSessionSelect,
  onNewChat,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="lg:hidden fixed inset-0 z-[60]"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="lg:hidden fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl flex flex-col"
        style={{
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          paddingBottom: "env(safe-area-inset-bottom)",
          maxHeight: "60vh",
        }}
      >
        {/* Handle bar */}
        <div
          className="mx-auto mt-3 mb-1 rounded-full"
          style={{ width: 36, height: 4, background: "var(--color-border)" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Chat History
          </span>
          <button
            onClick={onClose}
            style={{
              color: "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 8,
              minWidth: 48,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* New chat button */}
        <div style={{ padding: "0 16px 8px" }}>
          <button
            onClick={onNewChat}
            className="flex items-center gap-2 w-full cursor-pointer transition-colors duration-150"
            style={{
              background: "var(--color-primary)",
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 48,
            }}
          >
            <Plus size={16} />
            New chat
          </button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px" }}>
          {sessions.length === 0 && (
            <p
              className="text-center py-4"
              style={{ fontSize: 13, color: "var(--color-text-muted)" }}
            >
              No previous conversations.
            </p>
          )}
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => onSessionSelect(s.id)}
                className="flex flex-col w-full text-left cursor-pointer transition-colors duration-150"
                style={{
                  background: active ? "var(--color-primary-dim)" : "transparent",
                  border: "none",
                  borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                  borderRadius: 8,
                  padding: "10px 12px",
                  minHeight: 56,
                  gap: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    fontWeight: 500,
                  }}
                >
                  {formatSessionDate(s.last_active_at)}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: active ? "var(--color-primary)" : "var(--color-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {s.preview ?? "Empty session"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
