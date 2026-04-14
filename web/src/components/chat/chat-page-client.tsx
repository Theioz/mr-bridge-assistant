"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { History } from "lucide-react";
import type { Message } from "ai";
import ChatInterface from "./chat-interface";
import SessionSidebar from "./session-sidebar";
import SessionSheet from "./session-sheet";
import type { SessionPreview } from "@/app/api/chat/sessions/route";

interface Props {
  initialSessionId: string | null;
  initialMessages: Message[];
}

function newSessionId(): string {
  return crypto.randomUUID();
}

export default function ChatPageClient({ initialSessionId, initialMessages }: Props) {
  const [activeSessionId, setActiveSessionId] = useState<string>(
    initialSessionId ?? newSessionId()
  );
  const [activeMessages, setActiveMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(false);
  const [oldestPosition, setOldestPosition] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Incrementing this key forces ChatInterface to remount with fresh initialMessages
  const [refreshKey, setRefreshKey] = useState(0);

  // Desktop sidebar state — persisted in localStorage
  const [historyOpen, setHistoryOpen] = useState(false);
  // Mobile sheet state
  const [showSheet, setShowSheet] = useState(false);

  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  // Hydrate desktop panel state from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem("chatHistoryOpen");
    if (stored !== null) setHistoryOpen(stored === "true");
  }, []);

  // Persist activeSessionId to sessionStorage on every change (belt-and-suspenders)
  useEffect(() => {
    sessionStorage.setItem("chatActiveSessionId", activeSessionId);
  }, [activeSessionId]);

  // On mount: if SSR couldn't provide a session, check sessionStorage as fallback
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
      setSessions(data.sessions ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Re-fetch messages when the user returns to this tab so stale router-cache
  // data doesn't leave the chat a few conversations behind.
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const sessionId = activeSessionIdRef.current;
      // Skip if this is a brand-new unsaved session (nothing to fetch yet)
      if (!initialSessionId && activeMessages.length === 0) return;
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
        setActiveMessages(msgs);
        setHasMore(data.hasMore ?? false);
        setOldestPosition(data.oldestPosition ?? null);
        setRefreshKey((k) => k + 1);
      } catch {
        // non-fatal — stale messages are better than a broken UI
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

  const handleNewChat = () => {
    setActiveSessionId(newSessionId());
    setActiveMessages([]);
    setShowSheet(false);
  };

  const handleSessionSelect = async (sessionId: string) => {
    setShowSheet(false);
    if (sessionId === activeSessionId) return;

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
    } catch {
      // non-fatal
    } finally {
      setLoadingSession(false);
    }
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

  // Refresh session list after a message exchange completes (so preview updates)
  const handleMessageSent = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {/* Mobile: opens bottom sheet */}
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

          {/* Desktop: toggles collapsible sidebar */}
          <button
            onClick={toggleDesktopHistory}
            className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-150"
            aria-label={historyOpen ? "Close history" : "Open history"}
            style={{
              background: historyOpen ? "var(--color-primary-dim)" : "transparent",
              border: "none",
              color: historyOpen ? "var(--color-primary)" : "var(--color-text-muted)",
              cursor: "pointer",
              width: 36,
              height: 36,
            }}
            onMouseEnter={(e) => {
              if (!historyOpen)
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!historyOpen)
                (e.currentTarget as HTMLElement).style.background = "transparent";
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
          className="transition-colors duration-150"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--color-text-muted)",
            padding: "8px 4px",
            minHeight: 48,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
          }}
        >
          New chat
        </button>
      </div>

      {/* Content row: sidebar + chat */}
      <div className="flex gap-4 items-stretch flex-1 min-h-0">
        {/* Desktop history sidebar */}
        {historyOpen && (
          <div className="hidden lg:block">
            <SessionSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
              onNewChat={handleNewChat}
            />
          </div>
        )}

        {/* Chat interface */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {loadingSession ? (
            <div
              className="flex flex-1 items-center justify-center"
              style={{ color: "var(--color-text-muted)", fontSize: 14 }}
            >
              Loading conversation&hellip;
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
            />
          )}
        </div>
      </div>

      {/* Mobile session sheet */}
      <SessionSheet
        open={showSheet}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onClose={() => setShowSheet(false)}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
