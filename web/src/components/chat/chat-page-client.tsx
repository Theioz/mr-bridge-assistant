"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { History, Plus } from "lucide-react";
import type { UIMessage } from "ai";
import ChatInterface from "./chat-interface";
import SessionSidebar from "./session-sidebar";
import SessionSheet from "./session-sheet";
import { UndoToastProvider, useUndoToast } from "@/components/ui/undo-toast";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import type { SessionPreview } from "@/app/api/chat/sessions/route";

interface Props {
  initialSessionId: string | null;
  initialMessages: UIMessage[];
  initialHasMore?: boolean;
  initialOldestPosition?: number | null;
}

function newSessionId(): string {
  return crypto.randomUUID();
}

type SessionMessageRow = {
  id: string;
  role: string;
  content: string;
  parts: UIMessage["parts"] | null;
  created_at: string;
};

// Prefer the structured `parts` column; fall back to a synthetic text part
// for any row missing it (e.g. a pre-migration row that escaped backfill).
function hydrateMessage(m: SessionMessageRow): UIMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts ?? [{ type: "text" as const, text: m.content }],
    metadata: { createdAt: m.created_at },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Storage-backed external stores
//
// useSyncExternalStore lets us read localStorage/sessionStorage without a
// setState-in-effect cascade. Each store has a subscribe that listens for
// cross-tab "storage" events plus a same-tab custom event dispatched when we
// write. getServerSnapshot returns the pre-hydration default, so SSR and the
// initial client render match; React swaps in the real storage value after
// hydration completes.

const HISTORY_OPEN_KEY = "chatHistoryOpen";
const HISTORY_OPEN_EVENT = "chat-history-open-changed";

function subscribeHistoryOpen(onChange: () => void): () => void {
  window.addEventListener(HISTORY_OPEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HISTORY_OPEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getHistoryOpenSnapshot(): boolean {
  const stored = localStorage.getItem(HISTORY_OPEN_KEY);
  return stored === null ? true : stored === "true";
}

function getHistoryOpenServerSnapshot(): boolean {
  return true;
}

function writeHistoryOpen(value: boolean): void {
  localStorage.setItem(HISTORY_OPEN_KEY, String(value));
  window.dispatchEvent(new Event(HISTORY_OPEN_EVENT));
}

const CHAT_PREFILL_KEY = "chatPrefill";
const CHAT_PREFILL_EVENT = "chat-prefill-changed";

function subscribeChatPrefill(onChange: () => void): () => void {
  window.addEventListener(CHAT_PREFILL_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHAT_PREFILL_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getChatPrefillSnapshot(): string | null {
  return sessionStorage.getItem(CHAT_PREFILL_KEY);
}

function getChatPrefillServerSnapshot(): string | null {
  return null;
}

function clearChatPrefill(): void {
  sessionStorage.removeItem(CHAT_PREFILL_KEY);
  window.dispatchEvent(new Event(CHAT_PREFILL_EVENT));
}

export default function ChatPageClient(props: Props) {
  return (
    <UndoToastProvider>
      <ChatPageClientInner {...props} />
    </UndoToastProvider>
  );
}

function ChatPageClientInner({
  initialSessionId,
  initialMessages,
  initialHasMore = false,
  initialOldestPosition = null,
}: Props) {
  const [activeSessionId, setActiveSessionId] = useState<string>(
    initialSessionId ?? newSessionId()
  );
  const [activeMessages, setActiveMessages] = useState<UIMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [oldestPosition, setOldestPosition] = useState<number | null>(initialOldestPosition);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [timeTick, setTimeTick] = useState(0);

  const historyOpen = useSyncExternalStore(
    subscribeHistoryOpen,
    getHistoryOpenSnapshot,
    getHistoryOpenServerSnapshot,
  );
  const [showSheet, setShowSheet] = useState(false);
  const { isKeyboardOpen } = useKeyboardOpen();

  const [allSessions, setAllSessions] = useState<SessionPreview[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const chatPrefill = useSyncExternalStore(
    subscribeChatPrefill,
    getChatPrefillSnapshot,
    getChatPrefillServerSnapshot,
  );

  const toast = useUndoToast();

  const { sessions, archivedSessions } = useMemo(() => {
    const active: SessionPreview[] = [];
    const archived: SessionPreview[] = [];
    for (const s of allSessions) {
      if (s.deleted_at) archived.push(s);
      else active.push(s);
    }
    return { sessions: active, archivedSessions: archived };
  }, [allSessions]);

  useEffect(() => {
    sessionStorage.setItem("chatActiveSessionId", activeSessionId);
  }, [activeSessionId]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setAllSessions(data.sessions ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    const initSessions = async () => {
      try {
        const res = await fetch("/api/chat/sessions");
        if (!res.ok) return;
        const data = await res.json();
        const list: SessionPreview[] = data.sessions ?? [];
        setAllSessions(list);

        const active = list.filter((s) => !s.deleted_at);
        const mostRecent = active[0];
        // SSR already loaded messages for initialSessionId; skip the refetch when it matches.
        // activeSessionId here is the mount-time value — acceptable because this init effect
        // runs once and any user-driven session switch during the in-flight fetch is rare.
        if (
          mostRecent &&
          mostRecent.id !== activeSessionId &&
          mostRecent.id !== initialSessionId
        ) {
          setLoadingSession(true);
          try {
            const msgRes = await fetch(`/api/chat/sessions/${mostRecent.id}`);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              const msgs: UIMessage[] = (msgData.messages as SessionMessageRow[]).map(hydrateMessage);
              setActiveSessionId(mostRecent.id);
              setActiveMessages(msgs);
              setHasMore(msgData.hasMore ?? false);
              setOldestPosition(msgData.oldestPosition ?? null);
              setRefreshKey((k) => k + 1);
            }
          } finally {
            setLoadingSession(false);
          }
        }
      } catch {
        // non-fatal
      }
    };
    initSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibility handler re-registers on activeSessionId change (cheap listener
  // swap) rather than using a latest-ref pattern, which react-hooks/refs forbids
  // in React 19. The guard on empty initial state only matters pre-first-message,
  // so rebinding per-message after that is acceptable.
  const hasAnyMessages = activeMessages.length > 0;
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      setTimeTick((t) => t + 1);
      if (!initialSessionId && !hasAnyMessages) return;
      try {
        const listRes = await fetch("/api/chat/sessions");
        let sessionId = activeSessionId;
        if (listRes.ok) {
          const listData = await listRes.json();
          const list: SessionPreview[] = listData.sessions ?? [];
          setAllSessions(list);
          const activeList = list.filter((s) => !s.deleted_at);
          if (activeList[0] && activeList[0].id !== sessionId) {
            sessionId = activeList[0].id;
            setActiveSessionId(sessionId);
          }
        }
        const res = await fetch(`/api/chat/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: UIMessage[] = (data.messages as SessionMessageRow[]).map(hydrateMessage);
        setActiveMessages(msgs);
        setHasMore(data.hasMore ?? false);
        setOldestPosition(data.oldestPosition ?? null);
        setRefreshKey((k) => k + 1);
      } catch {
        // non-fatal
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [activeSessionId, hasAnyMessages, initialSessionId]);

  const toggleDesktopHistory = () => {
    writeHistoryOpen(!historyOpen);
  };

  useEffect(() => {
    if (chatPrefill !== null) clearChatPrefill();
  }, [chatPrefill]);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(newSessionId());
    setActiveMessages([]);
    setHasMore(false);
    setOldestPosition(null);
    setShowSheet(false);
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: UIMessage[] = (data.messages as SessionMessageRow[]).map(hydrateMessage);
      setActiveSessionId(sessionId);
      setActiveMessages(msgs);
      setHasMore(data.hasMore ?? false);
      setOldestPosition(data.oldestPosition ?? null);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const handleSessionSelect = async (sessionId: string) => {
    setShowSheet(false);
    if (sessionId === activeSessionId) return;
    await loadSession(sessionId);
  };

  const handleLoadMore = useCallback(async () => {
    if (!oldestPosition || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/chat/sessions/${activeSessionId}?before=${oldestPosition}&limit=20`
      );
      const data = await res.json();
      const older: UIMessage[] = (data.messages as SessionMessageRow[]).map(hydrateMessage);
      setActiveMessages((prev) => [...older, ...prev]);
      setHasMore(data.hasMore ?? false);
      setOldestPosition(data.oldestPosition ?? null);
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false);
    }
  }, [activeSessionId, oldestPosition, loadingMore]);

  // After every assistant turn (issue 319): refresh sidebar previews AND, if the
  // server-emitted turn-complete frame was missing (Lambda killed mid-stream),
  // reconcile the active session from server. Server-side onFinish always
  // persists a fallback row — DB is the source of truth even when the stream
  // was cut. The persisted message itself is the user-facing signal of the
  // failure (e.g. "I tried to update the event but it didn't go through").
  const handleMessageSent = useCallback(
    async (info?: { turnComplete: boolean; hadFailures: boolean; deadlineExceeded: boolean }) => {
      fetchSessions();
      if (!info || info.turnComplete) return;
      try {
        const res = await fetch(`/api/chat/sessions/${activeSessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: UIMessage[] = (data.messages as SessionMessageRow[]).map(hydrateMessage);
        setActiveMessages(msgs);
        setHasMore(data.hasMore ?? false);
        setOldestPosition(data.oldestPosition ?? null);
        setRefreshKey((k) => k + 1);
      } catch {
        // non-fatal
      }
    },
    [fetchSessions, activeSessionId]
  );

  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      const target = allSessions.find((s) => s.id === sessionId);
      if (!target) return;

      const nowIso = new Date().toISOString();
      setAllSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, deleted_at: nowIso } : s))
      );

      if (activeSessionId === sessionId) {
        const nextActive = allSessions.find(
          (s) => !s.deleted_at && s.id !== sessionId
        );
        if (nextActive) {
          await loadSession(nextActive.id);
        } else {
          handleNewChat();
        }
      }

      try {
        await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // non-fatal — row remains active on server if request fails
      }

      toast.show(
        "Chat archived",
        () => {
          setAllSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, deleted_at: null } : s))
          );
          fetch(`/api/chat/sessions/${sessionId}/restore`, { method: "POST" }).catch(() => {});
        },
        10000
      );
    },
    [allSessions, activeSessionId, loadSession, handleNewChat, toast]
  );

  const handleRestoreSession = useCallback(
    async (sessionId: string) => {
      setAllSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, deleted_at: null } : s))
      );
      try {
        const res = await fetch(`/api/chat/sessions/${sessionId}/restore`, { method: "POST" });
        if (res.ok) fetchSessions();
      } catch {
        // non-fatal
      }
    },
    [fetchSessions]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Page header */}
      <div
        className="flex items-center justify-between print:hidden"
        style={{ marginBottom: "var(--space-5)" }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <button
            onClick={() => setShowSheet(true)}
            className="lg:hidden flex items-center justify-center cursor-pointer hover-bg-subtle hover-text-brighten"
            aria-label="Chat history"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              width: 44,
              height: 44,
              borderRadius: "var(--r-2)",
              transition: `color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart)`,
            }}
          >
            <History size={18} />
          </button>

          <h1
            className="font-heading"
            style={{
              fontSize: "var(--t-h1)",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--color-text)",
            }}
          >
            Chat
          </h1>
        </div>

        <button
          onClick={handleNewChat}
          className="cursor-pointer hover-text-brighten"
          style={{
            background: "transparent",
            border: "none",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
            padding: "var(--space-2) var(--space-1)",
            minHeight: 44,
            transition: `color var(--motion-fast) var(--ease-out-quart)`,
          }}
        >
          New chat
        </button>
      </div>

      {/* Content row: sidebar + chat */}
      <div
        className="flex items-stretch flex-1 min-h-0"
        style={{ gap: "var(--space-5)" }}
      >
        <div className="hidden lg:block print:hidden">
          <SessionSidebar
            sessions={sessions}
            archivedSessions={archivedSessions}
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
            onNewChat={handleNewChat}
            onArchive={handleArchiveSession}
            onRestore={handleRestoreSession}
            timeTick={timeTick}
            expanded={historyOpen}
            onToggleExpanded={toggleDesktopHistory}
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {loadingSession ? (
            <div
              className="flex flex-1 flex-col"
              role="status"
              aria-label="Loading conversation"
              style={{
                gap: "var(--space-4)",
                padding: "var(--space-5) var(--space-4)",
              }}
            >
              {[80, 55, 70].map((w, i) => (
                <div
                  key={i}
                  className="flex flex-col"
                  style={{
                    gap: "var(--space-2)",
                    alignItems: i % 2 ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    className="skeleton"
                    style={{ width: `${w}%`, height: 14 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: `${w - 20}%`, height: 14 }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ChatInterface
              key={`${activeSessionId}-${refreshKey}`}
              sessionId={activeSessionId}
              initialMessages={activeMessages}
              onMessageSent={handleMessageSent}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              initialInput={chatPrefill ?? undefined}
            />
          )}
        </div>
      </div>

      {/* Mobile session sheet */}
      <SessionSheet
        open={showSheet}
        sessions={sessions}
        archivedSessions={archivedSessions}
        activeSessionId={activeSessionId}
        onClose={() => setShowSheet(false)}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
        onArchive={handleArchiveSession}
        onRestore={handleRestoreSession}
        timeTick={timeTick}
      />

      {/* Mobile new-chat FAB */}
      {!showSheet && !isKeyboardOpen && (
        <button
          onClick={handleNewChat}
          aria-label="New chat"
          className="lg:hidden fixed cursor-pointer"
          style={{
            right: "var(--space-4)",
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            width: 48,
            height: 48,
            borderRadius: 24,
            background: "var(--accent)",
            color: "var(--color-text-on-cta)",
            border: "none",
            boxShadow: "var(--shadow-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            transition: `opacity var(--motion-fast) var(--ease-out-quart)`,
          }}
        >
          <Plus size={22} />
        </button>
      )}
    </div>
  );
}
