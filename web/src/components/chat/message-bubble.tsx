"use client";

import { memo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { toolLabel, type ToolUIPart } from "./tool-status-bar";
import remarkGfm from "remark-gfm";
import type ReactMarkdownType from "react-markdown";
import dynamic from "next/dynamic";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
  loading: () => null,
}) as typeof ReactMarkdownType;

/**
 * Extract concatenated text from a UIMessage's parts array.
 * v5 replaced `message.content: string` with `message.parts: Part[]`.
 */
function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Read createdAt from our metadata shape (server stamps this, SSR hydrates it). */
function getCreatedAt(message: UIMessage): Date | null {
  const meta = message.metadata as { createdAt?: string | Date } | undefined;
  if (!meta?.createdAt) return null;
  return meta.createdAt instanceof Date ? meta.createdAt : new Date(meta.createdAt);
}

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
  message: UIMessage;
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
    <h1
      className="font-heading mt-3 mb-1 first:mt-0"
      style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      className="font-heading mt-3 mb-1 first:mt-0"
      style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      className="mt-2 mb-1 first:mt-0"
      style={{ fontSize: "var(--t-micro)", fontWeight: 500, color: "var(--color-text-muted)" }}
    >
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul
      className="list-disc list-inside mb-2 space-y-0.5"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className="list-decimal list-inside mb-2 space-y-0.5"
      style={{ color: "var(--color-text-muted)" }}
    >
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
      <table
        className="w-full tnum"
        style={{ fontSize: "var(--t-micro)", borderCollapse: "collapse" }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr style={{ borderBottom: "1px solid var(--rule-soft)" }}>{children}</tr>,
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

function getToolParts(message: UIMessage): ToolUIPart[] {
  const result: ToolUIPart[] = [];
  for (const p of message.parts) {
    const tp = p as {
      type?: string;
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
    };
    if (
      typeof tp.type === "string" &&
      tp.type.startsWith("tool-") &&
      (tp.state === "output-available" || tp.state === "output-error")
    ) {
      result.push(tp as ToolUIPart);
    }
  }
  return result;
}

function summarizeOutput(toolName: string, output: unknown): string {
  if (Array.isArray(output)) {
    const n = output.length;
    return n === 1 ? "1 item" : `${n} items`;
  }
  if (output && typeof output === "object") {
    if ("ok" in output && (output as { ok: unknown }).ok === false) return "failed";
    for (const key of [
      "tasks",
      "habits",
      "events",
      "items",
      "meals",
      "recipes",
      "sessions",
      "workouts",
      "results",
    ]) {
      const val = (output as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        const n = val.length;
        return n === 1 ? "1 item" : `${n} items`;
      }
    }
  }
  void toolName;
  return "done";
}

function SourcesRow({ parts }: { parts: ToolUIPart[] }) {
  const [open, setOpen] = useState(false);
  const n = parts.length;
  const label = n === 1 ? "1 source" : `${n} sources`;

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          fontSize: "var(--t-micro)",
          color: "var(--color-text-faint)",
          textDecoration: "underline",
          textUnderlineOffset: 2,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="flex flex-wrap"
          style={{ gap: "var(--space-1)", marginTop: "var(--space-1)" }}
        >
          {parts.map((part) => {
            const toolName = part.type.slice("tool-".length);
            const isError = part.state === "output-error";
            const verb = toolLabel(toolName);
            const summary = isError ? "failed" : summarizeOutput(toolName, part.output);
            const raw = `${verb} — ${summary}`;
            const chipLabel = raw.length > 44 ? `${raw.slice(0, 44)}…` : raw;

            return (
              <span
                key={part.toolCallId}
                className="inline-flex items-center rounded-full"
                style={{
                  gap: "var(--space-1)",
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "var(--t-micro)",
                  background: "transparent",
                  border: `1px solid ${isError ? "var(--color-danger)" : "var(--rule-soft)"}`,
                  color: isError ? "var(--color-danger)" : "var(--color-text-faint)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontSize: 10,
                    lineHeight: 1,
                    color: isError ? "var(--color-danger)" : "var(--color-positive)",
                  }}
                >
                  {isError ? "✕" : "✓"}
                </span>
                {chipLabel}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

  const text = getMessageText(message);
  const createdAt = getCreatedAt(message);
  const showTime = createdAt && (revealed || pinned);
  const toolParts = !isUser ? getToolParts(message) : [];

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
          text
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {text}
          </ReactMarkdown>
        )}
        {toolParts.length > 0 && <SourcesRow parts={toolParts} />}
      </div>
      {createdAt && (
        <span
          aria-hidden={!showTime}
          title={formatExactDateTime(createdAt)}
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
          {formatExactTime(createdAt)}
        </span>
      )}
    </div>
  );
});

export default MessageBubble;
