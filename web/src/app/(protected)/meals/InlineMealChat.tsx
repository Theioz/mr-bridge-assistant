"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

interface Props {
  initialContext: string;
  onClose: () => void;
}

const inputStyle = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16,
  borderRadius: 8,
  padding: "10px 12px",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

export default function InlineMealChat({ initialContext, onClose }: Props) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: "user" as const, content: text };
    const displayMessages = [...messages, userMsg];
    setMessages(displayMessages);
    setInput("");
    setIsLoading(true);

    // Prepend nutrition context to the first user message in the API payload only.
    // The UI shows the user's actual text without the prefix.
    const apiMessages = displayMessages.map((m, i) =>
      i === 0 && m.role === "user"
        ? { ...m, content: `${initialContext}\n\n${m.content}` }
        : m
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messages: apiMessages,
          model: "auto",
        }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("0:")) {
            try {
              const token = JSON.parse(line.slice(2));
              assistantText += token;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: assistantText },
              ]);
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    // Fire-and-forget — don't block UI on deletion
    fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
    onClose();
  }

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        maxHeight: 360,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
          Mr. Bridge
        </span>
        <button
          onClick={handleClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 4 }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 120 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", textAlign: "center" }}>
            Ask anything about your scanned items.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-2xl px-3 py-2"
              style={{
                fontSize: 13,
                maxWidth: "85%",
                background: m.role === "user" ? "var(--color-primary)" : "var(--color-bg)",
                color: m.role === "user" ? "#fff" : "var(--color-text)",
                border: m.role === "assistant" ? "1px solid var(--color-border)" : "none",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {m.content || (isLoading && m.role === "assistant" ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex gap-2 px-3 pb-3 pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Ask Mr. Bridge…"
          disabled={isLoading}
          style={{ ...inputStyle, flex: 1, fontSize: 14 }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 13px",
            cursor: "pointer",
            opacity: isLoading || !input.trim() ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
