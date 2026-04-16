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

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: "var(--color-text)" }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>{children}</em>
  ),
  h1: ({ children }) => (
    <h1 className="font-heading mt-3 mb-1 first:mt-0" style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-heading mt-3 mb-1 first:mt-0" style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 first:mt-0" style={{ fontSize: "var(--t-micro)", fontWeight: 500, color: "var(--color-text-muted)" }}>
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
        className="block px-3 py-2 my-2 overflow-x-auto whitespace-pre"
        style={{
          fontSize: "var(--t-micro)",
          background: "var(--color-surface-raised)",
          color: "var(--color-text-muted)",
          borderRadius: "var(--r-2)",
        }}
      >
        {children}
      </code>
    ) : (
      <code
        className="px-1 py-0.5"
        style={{
          fontSize: "var(--t-micro)",
          background: "var(--color-surface-raised)",
          color: "var(--color-text-muted)",
          borderRadius: "var(--r-1)",
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full tnum" style={{ fontSize: "var(--t-micro)", borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: "1px solid var(--rule-soft)" }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className="text-left px-3 py-1.5"
      style={{
        fontWeight: 500,
        color: "var(--color-text-muted)",
        borderBottom: "1px solid var(--rule-soft)",
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
  hr: () => <hr style={{ borderColor: "var(--rule-soft)", margin: "var(--space-3) 0" }} />,
  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 italic my-2"
      style={{ borderLeft: "2px solid var(--rule)", color: "var(--color-text-muted)" }}
    >
      {children}
    </blockquote>
  ),
};

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

  // Role distinction is carried by layout (alignment + subtle surface tint on
  // the user side) rather than a color block. Spec: "user/assistant
  // distinguished by layout + subtle --color-surface-raised tint, NOT by
  // color blocks."
  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
      data-print-message-root=""
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      <div
        className="max-w-[85%] leading-relaxed"
        data-print-message={isUser ? "user" : "assistant"}
        style={{
          fontSize: "var(--t-meta)",
          color: "var(--color-text)",
          background: isUser ? "var(--color-surface-raised)" : "transparent",
          padding: isUser ? "var(--space-2) var(--space-4)" : "var(--space-1) 0",
          borderRadius: isUser ? "var(--r-2)" : 0,
          whiteSpace: isUser ? "pre-wrap" : undefined,
        }}
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
          className="tnum"
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            padding: "var(--space-1) var(--space-2) 0",
            opacity: showTime ? 1 : 0,
            transition: `opacity var(--motion-fast) var(--ease-out-quart)`,
            pointerEvents: showTime ? "auto" : "none",
            letterSpacing: "0.01em",
          }}
        >
          {formatExactTime(message.createdAt)}
        </span>
      )}
    </div>
  );
});

export default MessageBubble;
