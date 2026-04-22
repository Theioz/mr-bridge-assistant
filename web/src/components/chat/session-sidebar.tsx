"use client";

import { Plus, Trash2, RotateCcw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type CSSProperties } from "react";
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

const rowTransition = `color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart)`;

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

  // Collapse-to-rail is an instant width change. Animating `width` is a layout
  // property (Impeccable "layout-transition"); the alternative grid-template-
  // columns animation has patchy cross-browser support and the toggle is rare
  // enough that a snap reads cleaner than a 180ms layout shuffle.
  return (
    <aside
      aria-label="Chat history"
      style={{
        width: expanded ? 280 : 56,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        alignSelf: "flex-start",
        position: "sticky",
        top: "var(--space-5)",
        maxHeight: "calc(100dvh - var(--space-6))",
        borderRight: "1px solid var(--rule-soft)",
      }}
    >
      <div
        style={{
          padding: expanded ? "var(--space-2) var(--space-3) 0" : "var(--space-2) var(--space-1) 0",
          display: "flex",
          justifyContent: expanded ? "flex-end" : "center",
        }}
      >
        <button
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex items-center justify-center cursor-pointer hover-bg-subtle hover-text-brighten"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            width: 44,
            height: 44,
            borderRadius: "var(--r-2)",
            flexShrink: 0,
            transition: rowTransition,
          }}
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <div
        style={{
          padding: expanded
            ? "var(--space-2) var(--space-3) var(--space-3)"
            : "var(--space-1) var(--space-1) var(--space-3)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button
          onClick={onNewChat}
          aria-label={expanded ? undefined : "New chat"}
          className="flex items-center cursor-pointer hover-text-brighten"
          style={{
            background: "transparent",
            color: "var(--color-text)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-2)",
            width: expanded ? "100%" : 44,
            height: 44,
            padding: expanded ? "0 var(--space-3)" : 0,
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            justifyContent: expanded ? "flex-start" : "center",
            gap: expanded ? "var(--space-2)" : 0,
            transition: rowTransition,
          }}
        >
          <Plus size={15} strokeWidth={1.75} />
          {expanded && "New chat"}
        </button>
      </div>

      {expanded && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 var(--space-3) var(--space-4)",
          }}
        >
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
              <SectionToggle
                open={olderExpanded}
                onToggle={() => setOlderExpanded((v) => !v)}
                label={`Older (${older.length})`}
              />

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
              <SectionToggle
                open={archivedExpanded}
                onToggle={() => setArchivedExpanded((v) => !v)}
                label={`Recently deleted (${archivedSessions.length})`}
                dividerTop
              />

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

function SectionToggle({
  open,
  onToggle,
  label,
  dividerTop = false,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  dividerTop?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center w-full cursor-pointer hover-text-brighten"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--color-text-faint)",
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontSize: "var(--t-micro)",
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        gap: "var(--space-1)",
        padding: "var(--space-3) var(--space-2) var(--space-1)",
        minHeight: 44,
        marginTop: dividerTop ? "var(--space-1)" : 0,
        borderTop: dividerTop ? "1px solid var(--rule-soft)" : "none",
        transition: `color var(--motion-fast) var(--ease-out-quart)`,
      }}
    >
      <span
        aria-hidden
        style={{
          transform: open ? "rotate(90deg)" : "none",
          display: "inline-block",
          transition: `transform var(--motion-fast) var(--ease-out-quart)`,
        }}
      >
        ›
      </span>
      {label}
    </button>
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
  const rowStyle: CSSProperties = {
    position: "relative",
    borderTop: "1px solid var(--rule-soft)",
    transition: rowTransition,
  };
  return (
    <div className={`group/row ${active ? "" : "hover-bg-subtle"}`} style={rowStyle}>
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "var(--space-2)",
            bottom: "var(--space-2)",
            width: 2,
            borderRadius: 1,
            background: "var(--accent)",
          }}
        />
      )}
      <button
        onClick={() => onSelect(session.id)}
        aria-current={active ? "true" : undefined}
        className="flex flex-col w-full text-left cursor-pointer"
        style={{
          background: "transparent",
          border: "none",
          padding: "var(--space-3) var(--space-3) var(--space-3) calc(var(--space-3) + 2px)",
          paddingRight: "var(--space-6)",
          minHeight: 44,
          gap: 2,
        }}
      >
        <span
          className="tnum"
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {formatRelative(session.last_active_at)}
        </span>
        <span
          style={{
            fontSize: "var(--t-micro)",
            color: active ? "var(--accent)" : "var(--color-text)",
            fontWeight: active ? 500 : 400,
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
        className="opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover-text-danger"
        style={{
          position: "absolute",
          right: "var(--space-2)",
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: "var(--color-text-faint)",
          cursor: "pointer",
          padding: "var(--space-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--r-1)",
          transition: `color var(--motion-fast) var(--ease-out-quart), opacity var(--motion-fast) var(--ease-out-quart)`,
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
        padding: "var(--space-3)",
        gap: "var(--space-2)",
        opacity: 0.7,
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          {session.deleted_at ? formatRelative(session.deleted_at) : ""} · {daysLeft}d left
        </span>
        <span
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text)",
            textDecoration: "line-through",
            textDecorationColor: "var(--color-text-faint)",
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
        className="hover-text-brighten"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--accent)",
          fontSize: "var(--t-micro)",
          fontWeight: 600,
          cursor: "pointer",
          padding: "var(--space-1)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          minHeight: 44,
          transition: `color var(--motion-fast) var(--ease-out-quart)`,
        }}
      >
        <RotateCcw size={12} />
        Restore
      </button>
    </div>
  );
}
