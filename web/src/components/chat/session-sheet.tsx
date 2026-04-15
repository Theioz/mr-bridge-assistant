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
  const confirmingSession = confirmingId
    ? sessions.find((s) => s.id === confirmingId)
    : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Chat history"
      contentClassName="flex flex-col"
      contentStyle={{ maxHeight: "60vh" }}
    >
        <div
          className="mx-auto mt-3 mb-1 rounded-full"
          style={{ width: 36, height: 4, background: "var(--color-border)" }}
        />

        {/* Scroll container with sticky header */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              background: "var(--color-surface)",
              borderBottom: "1px solid var(--color-border)",
              padding: "4px 16px 12px",
            }}
          >
            <div className="flex items-center justify-between pt-2 pb-3">
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

          <div style={{ padding: "8px 12px 16px" }}>
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
                <div
                  key={`${s.id}-${timeTick}`}
                  style={{
                    position: "relative",
                    background: active ? "var(--color-primary-dim)" : "transparent",
                    borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                    borderRadius: 8,
                  }}
                >
                  <button
                    onClick={() => onSessionSelect(s.id)}
                    className="flex flex-col w-full text-left cursor-pointer"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "10px 12px",
                      paddingRight: 44,
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
                      {formatRelative(s.last_active_at)}
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingId(s.id);
                    }}
                    aria-label="Archive chat"
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      padding: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
                  className="flex items-center gap-1 w-full cursor-pointer"
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
                    marginTop: 8,
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <span style={{ transform: archivedExpanded ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 150ms" }}>
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
                          padding: "10px 12px",
                          gap: 8,
                          opacity: 0.7,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                            {s.deleted_at ? formatRelative(s.deleted_at) : ""} · {daysLeft}d left
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: "var(--color-text)",
                              textDecoration: "line-through",
                              textDecorationColor: "var(--color-text-muted)",
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
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--color-primary)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: 6,
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
                  })}
              </>
            )}
          </div>
        </div>

        <Dialog.Root
          open={confirmingId !== null}
          onOpenChange={(o) => { if (!o) setConfirmingId(null); }}
        >
          <Dialog.Portal>
            <Dialog.Overlay
              className="fixed inset-0 z-[80]"
              style={{ background: "var(--overlay-scrim)" }}
            />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-32px)] max-w-sm rounded-2xl"
              style={{
                transform: "translate(-50%, -50%)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                padding: 20,
              }}
            >
              <Dialog.Title
                className="font-heading font-semibold"
                style={{ fontSize: 16, color: "var(--color-text)" }}
              >
                Archive this chat?
              </Dialog.Title>
              <Dialog.Description
                className="mt-2"
                style={{ fontSize: 13, color: "var(--color-text-muted)" }}
              >
                {confirmingSession?.preview
                  ? `"${confirmingSession.preview.slice(0, 80)}${confirmingSession.preview.length > 80 ? "…" : ""}" — you'll have 10 seconds to undo.`
                  : "You'll have 10 seconds to undo."}
              </Dialog.Description>
              <div className="flex items-center justify-end gap-2" style={{ marginTop: 20 }}>
                <button
                  onClick={() => setConfirmingId(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirmingId) onArchive(confirmingId);
                    setConfirmingId(null);
                  }}
                  style={{
                    background: "var(--color-danger)",
                    border: "none",
                    color: "white",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
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
