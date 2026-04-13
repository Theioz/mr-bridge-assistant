"use client";

import { useState, useEffect, useCallback } from "react";
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
    } catch {
      // non-fatal
    } finally {
      setLoadingSession(false);
    }
  };

  // Refresh session list after a message exchange completes (so preview updates)
  const handleMessageSent = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div>
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
      <div className="flex gap-4 items-start">
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
        <div className="flex-1 min-w-0">
          {loadingSession ? (
            <div
              className="flex items-center justify-center"
              style={{ height: "calc(100dvh - 8rem)", color: "var(--color-text-muted)", fontSize: 14 }}
            >
              Loading conversation&hellip;
            </div>
          ) : (
            <ChatInterface
              key={activeSessionId}
              sessionId={activeSessionId}
              initialMessages={activeMessages}
              onMessageSent={handleMessageSent}
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
