"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, ChevronDown } from "lucide-react";
import { Fragment } from "react";
import MessageBubble from "./message-bubble";
import ToolStatusBar from "./tool-status-bar";
import SlashCommandMenu, { SLASH_COMMANDS, type SlashCommand } from "./slash-command-menu";
import { formatDaySeparator, isSameDay } from "@/lib/relative-time";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import type { Message } from "ai";

interface Props {
  sessionId: string;
  initialMessages: Message[];
  onMessageSent?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  initialInput?: string;
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

export default function ChatInterface({ sessionId, initialMessages, onMessageSent, hasMore, loadingMore, onLoadMore, initialInput }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const { isKeyboardOpen, viewportHeight } = useKeyboardOpen();
  const composerMaxHeight = isKeyboardOpen
    ? Math.max(80, Math.min(200, viewportHeight * 0.3))
    : 200;

  type ModelOverride = "auto" | "haiku" | "sonnet";
  const [modelOverride, setModelOverride] = useState<ModelOverride>("auto");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload, setInput } = useChat({
    api: "/api/chat",
    body: { sessionId, model: modelOverride },
    initialMessages,
    onFinish: onMessageSent,
  });

  // Seed input from navigation handoff (e.g. Scanner → Chat prefill)
  useEffect(() => {
    if (initialInput) setInput(initialInput);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
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
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      switch (e.key) {
        case "ArrowDown":
          if (menuCommands.length === 0) return;
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % menuCommands.length);
          break;
        case "ArrowUp":
          if (menuCommands.length === 0) return;
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + menuCommands.length) % menuCommands.length);
          break;
        case "Enter":
          if (isTouchDevice) return; // mobile: Enter always inserts newline
          if (e.shiftKey) return; // desktop: Shift+Enter inserts newline
          if (menuCommands.length > 0) {
            e.preventDefault();
            applyCommand(menuCommands[activeIndex]);
          } else {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          }
          break;
        case "Escape":
          if (menuCommands.length === 0) return;
          e.preventDefault();
          setMenuCommands([]);
          break;
        case "Tab":
          if (menuCommands.length === 0) return;
          e.preventDefault();
          applyCommand(menuCommands[activeIndex]);
          break;
      }
    },
    [isTouchDevice, menuCommands, activeIndex, applyCommand, handleSubmit]
  );

  // ── Scroll to bottom ─────────────────────────────────────────────────
  // On mount: snap instantly so the chat opens at the most recent message.
  // On new messages during the session: smooth scroll.
  const hasInitialScrolled = useRef(false);
  useEffect(() => {
    if (loadingMore) return; // don't jump when prepending older messages
    if (!hasInitialScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      hasInitialScrolled.current = true;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loadingMore]);

  // ── Auto-resize textarea ──────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, composerMaxHeight)}px`;
  }, [input, composerMaxHeight]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-3 py-4 min-h-0">
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={() => {
                const el = scrollContainerRef.current;
                const prevHeight = el?.scrollHeight ?? 0;
                onLoadMore?.();
                requestAnimationFrame(() => {
                  if (el) el.scrollTop += el.scrollHeight - prevHeight;
                });
              }}
              disabled={loadingMore}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs transition-opacity"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              {loadingMore ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Loading…
                </>
              ) : (
                "Load older messages"
              )}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="text-center mt-8" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            Ask Mr. Bridge anything.
          </p>
        )}
        {messages.map((m, i) => {
          const current = m.createdAt ?? new Date();
          const prev = messages[i - 1];
          const prevDate = prev?.createdAt ?? null;
          const showSeparator = !prevDate || !isSameDay(prevDate, current);
          return (
            <Fragment key={m.id}>
              {showSeparator && <DaySeparator date={current} />}
              <MessageBubble message={m} />
            </Fragment>
          );
        })}
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
              <span
                className="flex gap-1 motion-reduce:opacity-60"
                role="status"
                aria-label="Assistant is typing"
              >
                <span
                  className="rounded-full motion-safe:animate-bounce"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--color-text-muted)",
                    animationDelay: "0ms",
                  }}
                />
                <span
                  className="rounded-full motion-safe:animate-bounce"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--color-text-muted)",
                    animationDelay: "150ms",
                  }}
                />
                <span
                  className="rounded-full motion-safe:animate-bounce"
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
                border: "1px solid var(--color-danger)",
              }}
            >
              <span style={{ fontSize: 14, color: "var(--color-danger)" }}>
                {error.message?.includes("overloaded") ? "API overloaded — try again." : "Error — try again."}
              </span>
              <button
                onClick={() => reload()}
                className="cursor-pointer transition-colors duration-150 hover-text-brighten"
                style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "underline", textUnderlineOffset: 2 }}
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
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Mr. Bridge..."
            enterKeyHint={isTouchDevice ? "enter" : "send"}
            disabled={isLoading}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={menuCommands.length > 0}
            className="w-full rounded-xl px-4 py-2.5 text-sm transition-colors duration-150 focus:outline-none"
            style={{
              resize: "none",
              overflow: "hidden",
              maxHeight: composerMaxHeight,
              overflowY: "auto",
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
        {/* Model override chip */}
        <div className="relative flex-shrink-0 self-end mb-0.5">
          <button
            type="button"
            onClick={() => setModelMenuOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors duration-150"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: modelOverride === "auto" ? "var(--color-text-muted)" : "var(--color-primary)",
            }}
            title="Model override — Auto uses smart routing"
          >
            {modelOverride === "auto" ? "Auto" : modelOverride === "haiku" ? "Haiku" : "Sonnet"}
            <ChevronDown size={11} />
          </button>
          {modelMenuOpen && (
            <div
              className="absolute bottom-full mb-1 right-0 rounded-lg overflow-hidden z-10"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                minWidth: 100,
                boxShadow: "var(--shadow-md)",
              }}
            >
              {(["auto", "haiku", "sonnet"] as ModelOverride[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { setModelOverride(opt); setModelMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors duration-100 hover-bg-border"
                  style={{
                    color: modelOverride === opt ? "var(--color-primary)" : "var(--color-text)",
                    background: "transparent",
                  }}
                >
                  {opt === "auto" ? "Auto" : opt === "haiku" ? "Haiku (fast)" : "Sonnet (smart)"}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl px-3.5 py-2.5 cursor-pointer transition-opacity duration-150 hover:opacity-85 disabled:opacity-30 disabled:cursor-default disabled:hover:opacity-30"
          style={{ background: "var(--color-primary)", color: "var(--color-text-on-cta)" }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function DaySeparator({ date }: { date: Date }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "12px 0 4px",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {formatDaySeparator(date)}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}
