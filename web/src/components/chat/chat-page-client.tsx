"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { History, Plus } from "lucide-react";
import type { Message } from "ai";
import ChatInterface from "./chat-interface";
import SessionSidebar from "./session-sidebar";
import SessionSheet from "./session-sheet";
import { UndoToastProvider, useUndoToast } from "@/components/ui/undo-toast";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import type { SessionPreview } from "@/app/api/chat/sessions/route";

interface Props {
  initialSessionId: string | null;
  initialMessages: Message[];
  initialHasMore?: boolean;
  initialOldestPosition?: number | null;
}

function newSessionId(): string {
  return crypto.randomUUID();
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
  const [activeMessages, setActiveMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [oldestPosition, setOldestPosition] = useState<number | null>(initialOldestPosition);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [timeTick, setTimeTick] = useState(0);

  const [historyOpen, setHistoryOpen] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const { isKeyboardOpen } = useKeyboardOpen();

  const [allSessions, setAllSessions] = useState<SessionPreview[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);

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
    const stored = localStorage.getItem("chatHistoryOpen");
    if (stored !== null) setHistoryOpen(stored === "true");
  }, []);

  useEffect(() => {
    const prefill = sessionStorage.getItem("chatPrefill");
    if (prefill) {
      sessionStorage.removeItem("chatPrefill");
      setChatPrefill(prefill);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("chatActiveSessionId", activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (!initialSessionId) {
      const stored = sessionStorage.getItem("chatActiveSessionId");
      if (stored) setActiveSessionId(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (
          mostRecent &&
          mostRecent.id !== activeSessionIdRef.current &&
          mostRecent.id !== initialSessionId
        ) {
          setLoadingSession(true);
          try {
            const msgRes = await fetch(`/api/chat/sessions/${mostRecent.id}`);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              const msgs: Message[] = (
                msgData.messages as { id: string; role: string; content: string; created_at: string }[]
              ).map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                createdAt: new Date(m.created_at),
              }));
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

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      setTimeTick((t) => t + 1);
      if (!initialSessionId && activeMessages.length === 0) return;
      try {
        const listRes = await fetch("/api/chat/sessions");
        let sessionId = activeSessionIdRef.current;
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
        const msgs: Message[] = (
          data.messages as { id: string; role: string; content: string; created_at: string }[]
        ).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: new Date(m.created_at),
        }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const toggleDesktopHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    localStorage.setItem("chatHistoryOpen", String(next));
  };

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
      const msgs: Message[] = (
        data.messages as { id: string; role: string; content: string; created_at: string }[]
      ).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.created_at),
      }));
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
      const older: Message[] = (
        data.messages as { id: string; role: string; content: string; created_at: string }[]
      ).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.created_at),
      }));
      setActiveMessages((prev) => [...older, ...prev]);
      setHasMore(data.hasMore ?? false);
      setOldestPosition(data.oldestPosition ?? null);
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false);
    }
  }, [activeSessionId, oldestPosition, loadingMore]);

  const handleMessageSent = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

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
    [allSessions, activeSessionId, loadSession, handleNewChat, toast, fetchSessions]
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
      <div className="flex items-center justify-between mb-5 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSheet(true)}
            className="lg:hidden flex items-center justify-center rounded-lg transition-colors duration-150"
            aria-label="Chat history"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              width: 36,
              height: 36,
              minWidth: 48,
              minHeight: 48,
            }}
          >
            <History size={18} />
          </button>

          <h1
            className="font-heading font-semibold"
            style={{ fontSize: 24, color: "var(--color-text)" }}
          >
            Chat
          </h1>
        </div>

        <button
          onClick={handleNewChat}
          className="transition-colors duration-150 hover-text-brighten"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--color-text-muted)",
            padding: "8px 4px",
            minHeight: 48,
          }}
        >
          New chat
        </button>
      </div>

      {/* Content row: sidebar + chat */}
      <div className="flex gap-4 items-stretch flex-1 min-h-0">
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
              className="flex flex-1 flex-col gap-4 px-4 py-6"
              role="status"
              aria-label="Loading conversation"
            >
              {[80, 55, 70].map((w, i) => (
                <div key={i} className="flex flex-col gap-2" style={{ alignItems: i % 2 ? "flex-end" : "flex-start" }}>
                  <div
                    className="rounded-2xl animate-pulse"
                    style={{
                      width: `${w}%`,
                      height: 14,
                      background: "var(--color-surface-raised)",
                    }}
                  />
                  <div
                    className="rounded-2xl animate-pulse"
                    style={{
                      width: `${w - 20}%`,
                      height: 14,
                      background: "var(--color-surface-raised)",
                    }}
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
          className="lg:hidden fixed"
          style={{
            right: 16,
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            width: 48,
            height: 48,
            borderRadius: 24,
            background: "var(--color-primary)",
            color: "var(--color-text-on-cta)",
            border: "none",
            boxShadow: "var(--shadow-md)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <Plus size={22} />
        </button>
      )}
    </div>
  );
}
