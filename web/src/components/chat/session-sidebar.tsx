"use client";

import { Plus, Trash2, RotateCcw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import type { SessionPreview } from "@/app/api/chat/sessions/route";
import { formatRelative, daysUntilPurge } from "@/lib/relative-time";

interface Props {
  sessions: SessionPreview[];
  archivedSessions: SessionPreview[];
  activeSessionId: string;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  timeTick: number;
  expanded: boolean;
  onToggleExpanded: () => void;
}

const OLDER_THRESHOLD_DAYS = 30;

export default function SessionSidebar({
  sessions,
  archivedSessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onArchive,
  onRestore,
  timeTick,
  expanded,
  onToggleExpanded,
}: Props) {
  const [olderExpanded, setOlderExpanded] = useState(false);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

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
      aria-label="Chat history"
      style={{
        width: expanded ? 280 : 56,
        flexShrink: 0,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        alignSelf: "flex-start",
        position: "sticky",
        top: "2rem",
        maxHeight: "calc(100dvh - 4rem)",
        transition: "width 180ms ease",
      }}
    >
      <div
        style={{
          padding: expanded ? "8px 12px 0" : "8px 4px 0",
          display: "flex",
          justifyContent: expanded ? "flex-end" : "center",
        }}
      >
        <button
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex items-center justify-center cursor-pointer transition-colors duration-150 hover-bg-subtle"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            width: 48,
            height: 48,
            borderRadius: 8,
            flexShrink: 0,
          }}
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <div
        style={{
          padding: expanded ? "8px 12px 8px" : "4px 4px 8px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button
          onClick={onNewChat}
          aria-label={expanded ? undefined : "New chat"}
          className="flex items-center cursor-pointer transition-opacity duration-150 hover:opacity-85"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-text-on-cta)",
            border: "none",
            borderRadius: 8,
            width: expanded ? "100%" : 48,
            height: 48,
            padding: expanded ? "10px 14px" : 0,
            fontSize: 13,
            fontWeight: 500,
            justifyContent: "center",
            gap: expanded ? 8 : 0,
          }}
        >
          <Plus size={expanded ? 15 : 18} />
          {expanded && "New chat"}
        </button>
      </div>

      {expanded && (
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {recent.map((s) => (
          <SessionRow
            key={`${s.id}-${timeTick}`}
            session={s}
            active={s.id === activeSessionId}
            onSelect={onSessionSelect}
            onArchive={onArchive}
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
                cursor: "pointer",
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
                  key={`${s.id}-${timeTick}`}
                  session={s}
                  active={s.id === activeSessionId}
                  onSelect={onSessionSelect}
                  onArchive={onArchive}
                />
              ))}
          </>
        )}

        {archivedSessions.length > 0 && (
          <>
            <button
              onClick={() => setArchivedExpanded((v) => !v)}
              className="flex items-center gap-1 w-full cursor-pointer transition-colors duration-150"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "12px 8px 4px",
                minHeight: 40,
                marginTop: 4,
                borderTop: "1px solid var(--color-border)",
                cursor: "pointer",
              }}
            >
              <span style={{ transform: archivedExpanded ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 150ms" }}>
                ›
              </span>
              Recently deleted ({archivedSessions.length})
            </button>

            {archivedExpanded &&
              archivedSessions.map((s) => (
                <ArchivedRow key={`${s.id}-${timeTick}`} session={s} onRestore={onRestore} />
              ))}
          </>
        )}
      </div>
      )}
    </aside>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onArchive,
}: {
  session: SessionPreview;
  active: boolean;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div
      className={`group/row relative transition-colors duration-150 ${active ? "" : "hover-bg-subtle"}`}
      style={{
        background: active ? "var(--color-primary-dim)" : "transparent",
        borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
        borderRadius: 6,
      }}
    >
      <button
        onClick={() => onSelect(session.id)}
        className="flex flex-col w-full text-left cursor-pointer"
        style={{
          background: "transparent",
          border: "none",
          padding: "8px 10px",
          paddingRight: 32,
          minHeight: 48,
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            fontWeight: 500,
          }}
        >
          {formatRelative(session.last_active_at)}
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onArchive(session.id);
        }}
        aria-label="Delete chat"
        className="opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-colors duration-150 hover-text-danger"
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ArchivedRow({
  session,
  onRestore,
}: {
  session: SessionPreview;
  onRestore: (id: string) => void;
}) {
  const daysLeft = session.deleted_at ? daysUntilPurge(session.deleted_at) : 30;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        gap: 8,
        opacity: 0.7,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {session.deleted_at ? formatRelative(session.deleted_at) : ""} · {daysLeft}d left
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-text)",
            textDecoration: "line-through",
            textDecorationColor: "var(--color-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.preview ?? "Empty session"}
        </span>
      </div>
      <button
        onClick={() => onRestore(session.id)}
        aria-label="Restore chat"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-primary)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <RotateCcw size={12} />
        Restore
      </button>
    </div>
  );
}
