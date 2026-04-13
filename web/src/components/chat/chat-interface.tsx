"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import MessageBubble from "./message-bubble";
import ToolStatusBar from "./tool-status-bar";
import type { Message } from "ai";

interface Props {
  sessionId: string;
  initialMessages: Message[];
  onMessageSent?: () => void;
}

export default function ChatInterface({ sessionId, initialMessages, onMessageSent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload } = useChat({
    api: "/api/chat",
    body: { sessionId },
    initialMessages,
    onFinish: onMessageSent,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 8rem)" }}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 py-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-center mt-8" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            Ask Mr. Bridge anything.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <ToolStatusBar messages={messages} isLoading={isLoading} />

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-2.5"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <span className="flex gap-1">
                <span
                  className="rounded-full animate-bounce"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--color-text-muted)",
                    animationDelay: "0ms",
                  }}
                />
                <span
                  className="rounded-full animate-bounce"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--color-text-muted)",
                    animationDelay: "150ms",
                  }}
                />
                <span
                  className="rounded-full animate-bounce"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--color-text-muted)",
                    animationDelay: "300ms",
                  }}
                />
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-3"
              style={{
                background: "var(--color-surface)",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              <span style={{ fontSize: 14, color: "var(--color-danger)" }}>
                {error.message?.includes("overloaded") ? "API overloaded — try again." : "Error — try again."}
              </span>
              <button
                onClick={() => reload()}
                className="cursor-pointer transition-colors duration-150"
                style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "underline", textUnderlineOffset: 2 }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--color-text)")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--color-text-muted)")}
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 py-3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask Mr. Bridge..."
          disabled={isLoading}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors duration-150 focus:outline-none"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-dim)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl px-3.5 py-2.5 cursor-pointer transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
          style={{ background: "var(--color-primary)", color: "white" }}
          onMouseEnter={(e) => {
            if (!(e.currentTarget as HTMLButtonElement).disabled)
              (e.currentTarget as HTMLElement).style.background = "#4F52D9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--color-primary)";
          }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
