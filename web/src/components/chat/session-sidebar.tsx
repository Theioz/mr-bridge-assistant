"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { SessionPreview } from "@/app/api/chat/sessions/route";

interface Props {
  sessions: SessionPreview[];
  activeSessionId: string;
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

const OLDER_THRESHOLD_DAYS = 30;

export default function SessionSidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
}: Props) {
  const [olderExpanded, setOlderExpanded] = useState(false);

  const now = new Date();
  const recent = sessions.filter((s) => {
    const diffMs = now.getTime() - new Date(s.last_active_at).getTime();
    return diffMs < OLDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  });
  const older = sessions.filter((s) => {
    const diffMs = now.getTime() - new Date(s.last_active_at).getTime();
    return diffMs >= OLDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  });

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        alignSelf: "flex-start",
        maxHeight: "calc(100dvh - 8rem)",
      }}
    >
      {/* New chat button */}
      <div style={{ padding: "12px 12px 8px" }}>
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 w-full cursor-pointer transition-colors duration-150"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            minHeight: 48,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#4F52D9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--color-primary)";
          }}
        >
          <Plus size={15} />
          New chat
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {recent.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            onSelect={onSessionSelect}
          />
        ))}

        {older.length > 0 && (
          <>
            <button
              onClick={() => setOlderExpanded((v) => !v)}
              className="flex items-center gap-1 w-full cursor-pointer transition-colors duration-150"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "8px 8px 4px",
                minHeight: 40,
              }}
            >
              <span style={{ transform: olderExpanded ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 150ms" }}>
                ›
              </span>
              Older ({older.length})
            </button>

            {olderExpanded &&
              older.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeSessionId}
                  onSelect={onSessionSelect}
                />
              ))}
          </>
        )}
      </div>
    </aside>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: SessionPreview;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(session.id)}
      className="flex flex-col w-full text-left cursor-pointer transition-colors duration-150"
      style={{
        background: active ? "var(--color-primary-dim)" : "transparent",
        border: "none",
        borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
        borderRadius: 6,
        padding: "8px 10px",
        minHeight: 48,
        gap: 2,
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          fontWeight: 500,
        }}
      >
        {formatSessionDate(session.last_active_at)}
      </span>
      <span
        style={{
          fontSize: 12,
          color: active ? "var(--color-primary)" : "var(--color-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {session.preview ?? "Empty session"}
      </span>
    </button>
  );
}
