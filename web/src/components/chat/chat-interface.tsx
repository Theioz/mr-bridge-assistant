"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import MessageBubble from "./message-bubble";
import ToolStatusBar from "./tool-status-bar";
import SlashCommandMenu, { SLASH_COMMANDS, type SlashCommand } from "./slash-command-menu";
import type { Message } from "ai";

interface Props {
  sessionId: string;
  initialMessages: Message[];
  onMessageSent?: () => void;
}

// Returns the slash token the cursor is currently inside, or null.
// A valid token is "/" at position 0 or preceded by whitespace, with no
// whitespace between the slash and the cursor.
function getSlashToken(value: string, cursorPos: number): { start: number; query: string } | null {
  const before = value.slice(0, cursorPos);
  const match = before.match(/(?:^|(?<=\s))(\/\S*)$/);
  if (!match) return null;
  const start = before.lastIndexOf(match[1]);
  return { start, query: match[1].slice(1).toLowerCase() };
}

export default function ChatInterface({ sessionId, initialMessages, onMessageSent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload, setInput } = useChat({
    api: "/api/chat",
    body: { sessionId },
    initialMessages,
    onFinish: onMessageSent,
  });

  // ── Slash-command menu state ──────────────────────────────────────────
  const [menuCommands, setMenuCommands] = useState<SlashCommand[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateMenu = useCallback((value: string, cursorPos: number) => {
    const token = getSlashToken(value, cursorPos);
    if (!token) {
      setMenuCommands([]);
      return;
    }
    const filtered = SLASH_COMMANDS.filter((c) =>
      c.name.startsWith(token.query)
    );
    setMenuCommands(filtered);
    setActiveIndex(0);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleInputChange(e);
      updateMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    [handleInputChange, updateMenu]
  );

  const applyCommand = useCallback(
    (cmd: SlashCommand) => {
      const el = inputRef.current;
      const cursorPos = el?.selectionStart ?? input.length;
      const token = getSlashToken(input, cursorPos);
      if (!token) return;
      // Insert "/name " (no placeholder brackets) so user can type the arg
      const insert = `/${cmd.name} `;
      const newValue = input.slice(0, token.start) + insert + input.slice(cursorPos);
      setInput(newValue);
      setMenuCommands([]);
      // Move cursor to end of inserted text
      const newCursor = token.start + insert.length;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newCursor, newCursor);
      });
    },
    [input, setInput]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (menuCommands.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % menuCommands.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + menuCommands.length) % menuCommands.length);
          break;
        case "Enter":
          e.preventDefault();
          applyCommand(menuCommands[activeIndex]);
          break;
        case "Escape":
          e.preventDefault();
          setMenuCommands([]);
          break;
        case "Tab":
          e.preventDefault();
          applyCommand(menuCommands[activeIndex]);
          break;
      }
    },
    [menuCommands, activeIndex, applyCommand]
  );

  // ── Scroll to bottom on new messages ─────────────────────────────────
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
        {/* Wrapper provides anchor for the floating menu */}
        <div className="relative flex-1">
          {menuCommands.length > 0 && (
            <SlashCommandMenu
              commands={menuCommands}
              activeIndex={activeIndex}
              onSelect={applyCommand}
              onHover={setActiveIndex}
            />
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Mr. Bridge..."
            disabled={isLoading}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={menuCommands.length > 0}
            className="w-full rounded-xl px-4 py-2.5 text-sm transition-colors duration-150 focus:outline-none"
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
              setMenuCommands([]);
            }}
          />
        </div>
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
