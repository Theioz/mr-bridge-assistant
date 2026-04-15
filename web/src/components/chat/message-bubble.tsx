"use client";

import { memo, useRef, useState } from "react";
import type { Message } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function formatExactTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatExactDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  message: Message;
}

// Stable reference — defined outside the component so it never triggers a
// ReactMarkdown re-render from a new object identity on each parent update.
const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: "var(--color-text)" }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>{children}</em>
  ),
  h1: ({ children }) => (
    <h1 className="font-heading mt-3 mb-1 first:mt-0" style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-heading mt-3 mb-1 first:mt-0" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 first:mt-0" style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-muted)" }}>
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside mb-2 space-y-0.5" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-2 space-y-0.5" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    return isBlock ? (
      <code
        className="block rounded-lg px-3 py-2 my-2 text-xs overflow-x-auto whitespace-pre"
        style={{ background: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
      >
        {children}
      </code>
    ) : (
      <code
        className="rounded px-1 py-0.5 text-xs"
        style={{ background: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className="text-left px-3 py-1.5"
      style={{
        fontWeight: 500,
        color: "var(--color-text-muted)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </td>
  ),
  hr: () => <hr style={{ borderColor: "var(--color-border)", margin: "12px 0" }} />,
  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 italic my-2"
      style={{ borderLeft: "2px solid var(--color-border)", color: "var(--color-text-muted)" }}
    >
      {children}
    </blockquote>
  ),
};

// memo: only re-renders when message.content or message.role changes.
// During streaming, only the last (actively updating) bubble re-renders —
// all prior messages are skipped, eliminating per-token markdown re-parsing.
const MessageBubble = memo(function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const [revealed, setRevealed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = () => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setPinned((v) => !v);
      longPressTimer.current = null;
    }, 500);
  };

  const showTime = message.createdAt && (revealed || pinned);

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
        style={
          isUser
            ? {
                background: "var(--color-primary)",
                color: "#fff",
                borderBottomRightRadius: 4,
                whiteSpace: "pre-wrap",
              }
            : {
                background: "var(--color-surface)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderBottomLeftRadius: 4,
              }
        }
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
      {message.createdAt && (
        <span
          aria-hidden={!showTime}
          title={formatExactDateTime(message.createdAt)}
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            padding: "2px 6px 0",
            opacity: showTime ? 1 : 0,
            transition: "opacity 120ms",
            pointerEvents: showTime ? "auto" : "none",
          }}
        >
          {formatExactTime(message.createdAt)}
        </span>
      )}
    </div>
  );
});

export default MessageBubble;
