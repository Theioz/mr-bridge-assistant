"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X, Trash2, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { SessionPreview } from "@/app/api/chat/sessions/route";
import { formatRelative, daysUntilPurge } from "@/lib/relative-time";
import Sheet from "@/components/ui/sheet";

interface Props {
  open: boolean;
  sessions: SessionPreview[];
  archivedSessions: SessionPreview[];
  activeSessionId: string;
  onClose: () => void;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  timeTick: number;
}

const rowTransition = `color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart)`;

export default function SessionSheet({
  open,
  sessions,
  archivedSessions,
  activeSessionId,
  onClose,
  onSessionSelect,
  onNewChat,
  onArchive,
  onRestore,
  timeTick,
}: Props) {
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmingSession = confirmingId ? sessions.find((s) => s.id === confirmingId) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Chat history"
      hideHeader
      contentClassName="flex flex-col"
      contentStyle={{ maxHeight: "60vh" }}
    >
      <div
        className="mx-auto rounded-full"
        style={{
          marginTop: "var(--space-2)",
          marginBottom: "var(--space-1)",
          width: 36,
          height: 4,
          background: "var(--rule)",
        }}
      />

      {/* Scroll container with sticky header */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--rule-soft)",
            padding: "var(--space-1) var(--space-5) var(--space-3)",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ paddingTop: "var(--space-2)", paddingBottom: "var(--space-3)" }}
          >
            <span
              className="font-heading"
              style={{
                fontSize: "var(--t-h2)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--color-text)",
              }}
            >
              Chat history
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center cursor-pointer hover-bg-subtle hover-text-brighten"
              style={{
                color: "var(--color-text-muted)",
                background: "transparent",
                border: "none",
                minWidth: 44,
                minHeight: 44,
                borderRadius: "var(--r-2)",
                transition: rowTransition,
              }}
            >
              <X size={18} />
            </button>
          </div>
          <button
            onClick={onNewChat}
            className="flex items-center w-full cursor-pointer hover-text-brighten"
            style={{
              gap: "var(--space-2)",
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-2)",
              padding: "0 var(--space-4)",
              fontSize: "var(--t-meta)",
              fontWeight: 500,
              minHeight: 48,
              transition: rowTransition,
            }}
          >
            <Plus size={16} strokeWidth={1.75} />
            New chat
          </button>
        </div>

        <div style={{ padding: "var(--space-2) var(--space-3) var(--space-5)" }}>
          {sessions.length === 0 && (
            <p
              className="text-center"
              style={{
                padding: "var(--space-4) 0",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
              }}
            >
              No previous conversations.
            </p>
          )}
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <div
                key={`${s.id}-${timeTick}`}
                style={{
                  position: "relative",
                  borderTop: "1px solid var(--rule-soft)",
                  transition: rowTransition,
                }}
              >
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
                  onClick={() => onSessionSelect(s.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex flex-col w-full text-left cursor-pointer"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding:
                      "var(--space-3) var(--space-7) var(--space-3) calc(var(--space-3) + 2px)",
                    minHeight: 56,
                    gap: 3,
                  }}
                >
                  <span
                    className="tnum"
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                      fontWeight: 500,
                    }}
                  >
                    {formatRelative(s.last_active_at)}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--t-meta)",
                      color: active ? "var(--accent)" : "var(--color-text)",
                      fontWeight: active ? 500 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {s.preview ?? "Empty session"}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingId(s.id);
                  }}
                  aria-label="Archive chat"
                  className="hover-text-danger"
                  style={{
                    position: "absolute",
                    right: "var(--space-2)",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-faint)",
                    cursor: "pointer",
                    padding: "var(--space-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "var(--r-1)",
                    minWidth: 44,
                    minHeight: 44,
                    transition: `color var(--motion-fast) var(--ease-out-quart)`,
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}

          {archivedSessions.length > 0 && (
            <>
              <button
                onClick={() => setArchivedExpanded((v) => !v)}
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
                  marginTop: "var(--space-2)",
                  borderTop: "1px solid var(--rule-soft)",
                  transition: `color var(--motion-fast) var(--ease-out-quart)`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    transform: archivedExpanded ? "rotate(90deg)" : "none",
                    display: "inline-block",
                    transition: `transform var(--motion-fast) var(--ease-out-quart)`,
                  }}
                >
                  ›
                </span>
                Recently deleted ({archivedSessions.length})
              </button>

              {archivedExpanded &&
                archivedSessions.map((s) => {
                  const daysLeft = s.deleted_at ? daysUntilPurge(s.deleted_at) : 30;
                  return (
                    <div
                      key={`${s.id}-${timeTick}`}
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
                      <div
                        style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}
                      >
                        <span
                          className="tnum"
                          style={{
                            fontSize: "var(--t-micro)",
                            color: "var(--color-text-faint)",
                          }}
                        >
                          {s.deleted_at ? formatRelative(s.deleted_at) : ""} · {daysLeft}d left
                        </span>
                        <span
                          style={{
                            fontSize: "var(--t-meta)",
                            color: "var(--color-text)",
                            textDecoration: "line-through",
                            textDecorationColor: "var(--color-text-faint)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.preview ?? "Empty session"}
                        </span>
                      </div>
                      <button
                        onClick={() => onRestore(s.id)}
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
                })}
            </>
          )}
        </div>
      </div>

      <Dialog.Root
        open={confirmingId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmingId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[80]"
            style={{ background: "var(--overlay-scrim)" }}
          />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-32px)] max-w-sm"
            style={{
              transform: "translate(-50%, -50%)",
              background: "var(--color-surface)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-2)",
              padding: "var(--space-5)",
            }}
          >
            <Dialog.Title
              className="font-heading"
              style={{
                fontSize: "var(--t-h2)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--color-text)",
              }}
            >
              Archive this chat?
            </Dialog.Title>
            <Dialog.Description
              style={{
                marginTop: "var(--space-2)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              {confirmingSession?.preview
                ? `"${confirmingSession.preview.slice(0, 80)}${confirmingSession.preview.length > 80 ? "…" : ""}" — you'll have 10 seconds to undo.`
                : "You'll have 10 seconds to undo."}
            </Dialog.Description>
            <div
              className="flex items-center justify-end"
              style={{ marginTop: "var(--space-5)", gap: "var(--space-2)" }}
            >
              <button
                onClick={() => setConfirmingId(null)}
                className="cursor-pointer hover-bg-subtle"
                style={{
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  color: "var(--color-text)",
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--r-2)",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  minHeight: 44,
                  transition: rowTransition,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmingId) onArchive(confirmingId);
                  setConfirmingId(null);
                }}
                className="cursor-pointer"
                style={{
                  background: "var(--color-danger)",
                  border: "none",
                  color: "var(--color-text-on-cta)",
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--r-2)",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  minHeight: 44,
                  transition: `opacity var(--motion-fast) var(--ease-out-quart)`,
                }}
              >
                Archive
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Sheet>
  );
}
