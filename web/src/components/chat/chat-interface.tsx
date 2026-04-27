"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Send, Square, ChevronDown } from "lucide-react";
import { Fragment } from "react";
import MessageBubble from "./message-bubble";
import ToolStatusBar from "./tool-status-bar";
import SlashCommandMenu, { SLASH_COMMANDS, type SlashCommand } from "./slash-command-menu";
import { formatDaySeparator, isSameDay } from "@/lib/relative-time";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import type { UIMessage } from "ai";
import { NEEDS_CONTINUE_SIGNAL } from "@/lib/chat/synthesis";

interface Props {
  sessionId: string;
  initialMessages: UIMessage[];
  onMessageSent?: (info?: {
    turnComplete: boolean;
    hadFailures: boolean;
    deadlineExceeded: boolean;
  }) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  initialInput?: string;
}

// Turn-complete sentinel stamped as message metadata by /api/chat (issue 319).
// Absence after a turn ends means the Lambda was killed mid-stream and the
// client should refresh from server rather than trust local stream state.
// v5 moved this from a side-channel StreamData to per-message metadata.
type TurnCompleteMeta = {
  turnComplete?: {
    synthesized: boolean;
    hadFailures: boolean;
    deadlineExceeded: boolean;
    hitStepCap?: boolean;
  };
  createdAt?: string | Date;
};

/** Read createdAt from metadata — server stamps it, SSR hydrates it. */
function getCreatedAt(m: UIMessage): Date | null {
  const meta = m.metadata as TurnCompleteMeta | undefined;
  if (!meta?.createdAt) return null;
  return meta.createdAt instanceof Date ? meta.createdAt : new Date(meta.createdAt);
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

const composerTransition = `border-color var(--motion-fast) var(--ease-out-quart), box-shadow var(--motion-fast) var(--ease-out-quart)`;

function formatResetsAt(isoString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoString));
}

const TOUCH_QUERY = "(pointer: coarse)";

function subscribeTouch(onChange: () => void): () => void {
  const mq = window.matchMedia(TOUCH_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getTouchSnapshot(): boolean {
  return window.matchMedia(TOUCH_QUERY).matches;
}

function getTouchServerSnapshot(): boolean {
  return false;
}

export default function ChatInterface({
  sessionId,
  initialMessages,
  onMessageSent,
  hasMore,
  loadingMore,
  onLoadMore,
  initialInput,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isTouchDevice = useSyncExternalStore(
    subscribeTouch,
    getTouchSnapshot,
    getTouchServerSnapshot,
  );

  const { isKeyboardOpen, viewportHeight } = useKeyboardOpen();
  const composerMaxHeight = isKeyboardOpen
    ? Math.max(80, Math.min(200, viewportHeight * 0.3))
    : 200;

  type ModelOverride = "auto" | "haiku" | "sonnet";
  const [modelOverride, setModelOverride] = useState<ModelOverride>("auto");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  // Local input state — v5 removed useChat's managed input/handleInputChange.
  const [input, setInput] = useState(initialInput ?? "");
  // Tracks the resets_at of the last dismissed quota banner so re-triggering
  // the same error doesn't reshow it, but a different resets_at (new day) does.
  const [dismissedResetsAt, setDismissedResetsAt] = useState<string | null>(null);

  // Track the turn-complete sentinel from the server (issue 319). When the
  // stream ends, we inspect the assistant message's metadata to confirm it
  // arrived; if not, the Lambda was killed mid-stream and we tell the parent
  // so it can refresh from server.
  const turnCompleteRef = useRef(false);

  // Transport sends UIMessage[] (with structured tool / file / text parts)
  // directly. The server route converts to ModelMessage[] via
  // convertToModelMessages — see web/src/app/api/chat/route.ts.
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    transport,
    messages: initialMessages,
    onFinish: ({ message, isError }) => {
      if (isError) return;
      const meta = (message as UIMessage | undefined)?.metadata as TurnCompleteMeta | undefined;
      const tc = meta?.turnComplete;
      const turnComplete = !!tc;
      turnCompleteRef.current = turnComplete;
      onMessageSent?.({
        turnComplete,
        hadFailures: tc?.hadFailures ?? false,
        deadlineExceeded: tc?.deadlineExceeded ?? false,
      });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Show Continue button when the last assistant message signals it needs continuation.
  // Dual detection: metadata (reliable for current-session messages) + text signal
  // (fallback for messages loaded from DB on page refresh).
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const needsContinue = useMemo(() => {
    if (isLoading || !lastMsg || lastMsg.role !== "assistant") return false;
    const meta = (lastMsg.metadata as TurnCompleteMeta | undefined)?.turnComplete;
    if (meta?.hitStepCap || meta?.deadlineExceeded) return true;
    const text = lastMsg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    return text.includes(NEEDS_CONTINUE_SIGNAL);
  }, [isLoading, lastMsg]);

  const handleContinue = useCallback(() => {
    sendMessage({ text: "continue" }, { body: { sessionId, model: modelOverride } });
  }, [sendMessage, sessionId, modelOverride]);

  // Derive quota-exhausted state from useChat's error — no useEffect needed.
  // Dismissed when the user clicks Dismiss; reappears if a new resets_at arrives.
  const quotaExhausted = useMemo<{ resetsAt: string } | null>(() => {
    if (!error) return null;
    try {
      const parsed = JSON.parse(error.message) as { error?: string; resets_at?: string };
      if (parsed?.error === "daily_quota_exhausted" && parsed?.resets_at) {
        if (parsed.resets_at === dismissedResetsAt) return null;
        return { resetsAt: parsed.resets_at };
      }
    } catch {
      // not a quota error
    }
    return null;
  }, [error, dismissedResetsAt]);

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = input.trim();
      if (!text || isLoading || quotaExhausted) return;
      sendMessage({ text }, { body: { sessionId, model: modelOverride } });
      setInput("");
    },
    [input, isLoading, quotaExhausted, sendMessage, sessionId, modelOverride],
  );

  // ── Slash-command menu state ──────────────────────────────────────────
  const [menuCommands, setMenuCommands] = useState<SlashCommand[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateMenu = useCallback((value: string, cursorPos: number) => {
    const token = getSlashToken(value, cursorPos);
    if (!token) {
      setMenuCommands([]);
      return;
    }
    const filtered = SLASH_COMMANDS.filter((c) => c.name.startsWith(token.query));
    setMenuCommands(filtered);
    setActiveIndex(0);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      updateMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    [updateMenu],
  );

  const applyCommand = useCallback(
    (cmd: SlashCommand) => {
      const el = inputRef.current;
      const cursorPos = el?.selectionStart ?? input.length;
      const token = getSlashToken(input, cursorPos);
      if (!token) return;
      const insert = `/${cmd.name} `;
      const newValue = input.slice(0, token.start) + insert + input.slice(cursorPos);
      setInput(newValue);
      setMenuCommands([]);
      const newCursor = token.start + insert.length;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newCursor, newCursor);
      });
    },
    [input, setInput],
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
          if (isTouchDevice) return;
          if (e.shiftKey) return;
          if (menuCommands.length > 0) {
            e.preventDefault();
            applyCommand(menuCommands[activeIndex]);
          } else {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          }
          break;
        case "Escape":
          if (menuCommands.length > 0) {
            e.preventDefault();
            setMenuCommands([]);
            return;
          }
          if (status === "streaming" || status === "submitted") {
            e.preventDefault();
            stop();
          }
          break;
        case "Tab":
          if (menuCommands.length === 0) return;
          e.preventDefault();
          applyCommand(menuCommands[activeIndex]);
          break;
      }
    },
    [isTouchDevice, menuCommands, activeIndex, applyCommand, handleSubmit, status, stop],
  );

  // Esc cancels a turn in flight. The textarea is disabled while streaming
  // so the per-textarea keydown won't fire; attach to document only while
  // active to avoid hijacking Esc when idle (modal-close muscle memory).
  useEffect(() => {
    if (status !== "streaming" && status !== "submitted") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [status, stop]);

  // ── Scroll to bottom ─────────────────────────────────────────────────
  const hasInitialScrolled = useRef(false);
  useEffect(() => {
    if (loadingMore) return;
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
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{
          paddingTop: "var(--space-4)",
          paddingBottom: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {hasMore && (
          <div className="flex justify-center print:hidden" style={{ padding: "var(--space-2) 0" }}>
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
              className="flex items-center cursor-pointer hover-text-brighten"
              style={{
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--r-2)",
                fontSize: "var(--t-micro)",
                background: "transparent",
                border: "1px solid var(--rule)",
                color: "var(--color-text-muted)",
                minHeight: 44,
                transition: `color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)`,
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
          <p
            className="text-center"
            style={{
              marginTop: "var(--space-6)",
              fontSize: "var(--t-meta)",
              color: "var(--color-text-faint)",
            }}
          >
            Ask Mr. Bridge anything.
          </p>
        )}
        {messages.map((m, i) => {
          const current = getCreatedAt(m) ?? new Date();
          const prev = messages[i - 1];
          const prevDate = prev ? getCreatedAt(prev) : null;
          const showSeparator = !prevDate || !isSameDay(prevDate, current);
          return (
            <Fragment key={m.id}>
              {showSeparator && <DaySeparator date={current} />}
              <MessageBubble message={m} />
            </Fragment>
          );
        })}
        <ToolStatusBar messages={messages} isLoading={isLoading} />

        {/* Continue button — appears after step-cap or deadline messages so
            the user doesn't have to type "continue" manually. */}
        {needsContinue && (
          <div className="flex justify-start print:hidden">
            <button
              type="button"
              onClick={handleContinue}
              className="cursor-pointer hover-text-brighten"
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--r-2)",
                fontSize: "var(--t-micro)",
                background: "transparent",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                minHeight: 36,
                transition: `color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)`,
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* Typing indicator — opacity pulse (not bounce), accent as the one
            attention point during an active turn. */}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start print:hidden">
            <div
              style={{
                padding: "var(--space-2) var(--space-1)",
              }}
            >
              <span
                className="flex motion-reduce:opacity-60"
                role="status"
                aria-label="Assistant is typing"
                style={{ gap: "var(--space-1)" }}
              >
                <span
                  className="rounded-full motion-safe:typing-dot-pulse"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--accent)",
                    animationDelay: "0ms",
                  }}
                />
                <span
                  className="rounded-full motion-safe:typing-dot-pulse"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--accent)",
                    animationDelay: "200ms",
                  }}
                />
                <span
                  className="rounded-full motion-safe:typing-dot-pulse"
                  style={{
                    width: 6,
                    height: 6,
                    background: "var(--accent)",
                    animationDelay: "400ms",
                  }}
                />
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex justify-start print:hidden">
            <div
              className="flex items-center"
              style={{
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--r-2)",
                background: "var(--color-danger-subtle)",
                border: "1px solid var(--color-danger)",
              }}
            >
              <span style={{ fontSize: "var(--t-meta)", color: "var(--color-danger)" }}>
                {error.message?.includes("overloaded")
                  ? "API overloaded — try again."
                  : "Error — try again."}
              </span>
              <button
                onClick={() => regenerate()}
                className="cursor-pointer hover-text-brighten"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  background: "transparent",
                  border: "none",
                  transition: `color var(--motion-fast) var(--ease-out-quart)`,
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quota exhausted banner — above composer, persists until dismissed */}
      {quotaExhausted && (
        <div
          className="flex items-center justify-between print:hidden"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--r-2)",
            background: "var(--color-danger-subtle)",
            border: "1px solid var(--color-danger)",
            margin: "var(--space-2) 0 0",
          }}
        >
          <span style={{ fontSize: "var(--t-meta)", color: "var(--color-danger)" }}>
            Daily message limit reached. Resets at {formatResetsAt(quotaExhausted.resetsAt)}.
          </span>
          <button
            type="button"
            onClick={() => setDismissedResetsAt(quotaExhausted.resetsAt)}
            className="cursor-pointer hover-text-brighten"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              padding: "var(--space-1)",
              flexShrink: 0,
              transition: `color var(--motion-fast) var(--ease-out-quart)`,
            }}
            aria-label="Dismiss quota banner"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex print:hidden"
        style={{
          gap: "var(--space-2)",
          padding: "var(--space-3) 0",
          borderTop: "1px solid var(--rule-soft)",
        }}
      >
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
            aria-label="Message Mr. Bridge"
            enterKeyHint={isTouchDevice ? "enter" : "send"}
            disabled={isLoading}
            autoComplete="off"
            aria-autocomplete="list"
            className="w-full focus:outline-none"
            style={{
              resize: "none",
              overflow: "hidden",
              maxHeight: composerMaxHeight,
              overflowY: "auto",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--t-meta)",
              borderRadius: "var(--r-2)",
              background: "transparent",
              border: "1px solid var(--rule)",
              color: "var(--color-text)",
              transition: composerTransition,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-dim)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--rule)";
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
            className="flex items-center cursor-pointer hover-text-brighten"
            style={{
              gap: "var(--space-1)",
              borderRadius: "var(--r-2)",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--t-micro)",
              background: "transparent",
              border: "1px solid var(--rule)",
              color: modelOverride === "auto" ? "var(--color-text-muted)" : "var(--accent)",
              minHeight: 44,
              transition: `color var(--motion-fast) var(--ease-out-quart)`,
            }}
            title="Model override — Auto uses smart routing"
          >
            {modelOverride === "auto" ? "Auto" : modelOverride === "haiku" ? "Haiku" : "Sonnet"}
            <ChevronDown size={11} />
          </button>
          {modelMenuOpen && (
            <div
              className="absolute bottom-full right-0 overflow-hidden z-10"
              style={{
                marginBottom: "var(--space-1)",
                borderRadius: "var(--r-2)",
                background: "var(--color-surface)",
                border: "1px solid var(--rule)",
                minWidth: 108,
                boxShadow: "var(--shadow-md)",
              }}
            >
              {(["auto", "haiku", "sonnet"] as ModelOverride[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setModelOverride(opt);
                    setModelMenuOpen(false);
                  }}
                  className="w-full text-left cursor-pointer hover-bg-subtle"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--t-micro)",
                    color: modelOverride === opt ? "var(--accent)" : "var(--color-text)",
                    background: "transparent",
                    border: "none",
                    transition: `color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart)`,
                  }}
                >
                  {opt === "auto" ? "Auto" : opt === "haiku" ? "Haiku (fast)" : "Sonnet (smart)"}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type={isLoading ? "button" : "submit"}
          onClick={isLoading ? () => stop() : undefined}
          disabled={!isLoading && (!input.trim() || !!quotaExhausted)}
          aria-label={isLoading ? "Stop generating" : "Send"}
          className="cursor-pointer hover-text-brighten disabled:opacity-30 disabled:cursor-default"
          style={{
            padding: "0 var(--space-4)",
            minWidth: 44,
            minHeight: 44,
            alignSelf: "flex-end",
            borderRadius: "var(--r-2)",
            background: "transparent",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: `color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart), opacity var(--motion-fast) var(--ease-out-quart)`,
          }}
        >
          {isLoading ? <Square size={14} fill="currentColor" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}

function DaySeparator({ date }: { date: Date }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: "var(--space-3)",
        margin: "var(--space-3) 0 var(--space-1)",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
      <span
        className="font-heading"
        style={{
          fontSize: "var(--t-micro)",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-faint)",
        }}
      >
        {formatDaySeparator(date)}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
    </div>
  );
}
