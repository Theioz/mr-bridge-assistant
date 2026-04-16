"use client";

import { memo } from "react";
import type { Message } from "ai";

const TOOL_LABELS: Record<string, string> = {
  get_tasks: "Fetching tasks",
  add_task: "Adding task",
  complete_task: "Completing task",
  get_habits_today: "Fetching habits",
  log_habit: "Logging habit",
  get_fitness_summary: "Fetching fitness data",
  get_profile: "Loading profile",
  search_gmail: "Searching email",
  get_email_body: "Reading email",
  list_calendar_events: "Checking calendar",
  create_calendar_event: "Creating calendar event",
  get_recipes: "Searching recipes",
  log_meal: "Logging meal",
};

function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: "partial-call" | "call" | "result";
}

// AI SDK v4 message.parts shape (subset we care about)
type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-invocation"; toolInvocation: ToolInvocation }
  | { type: string };

interface Props {
  messages: Message[];
  isLoading: boolean;
}

/** Extract tool invocations from a message, checking parts first then toolInvocations. */
function getInvocations(msg: Message): ToolInvocation[] {
  const parts = (msg as unknown as { parts?: MessagePart[] }).parts;
  if (parts?.length) {
    return parts
      .filter((p): p is { type: "tool-invocation"; toolInvocation: ToolInvocation } =>
        p.type === "tool-invocation"
      )
      .map((p) => p.toolInvocation);
  }
  return (msg.toolInvocations as ToolInvocation[] | undefined) ?? [];
}

const ToolStatusBar = memo(function ToolStatusBar({ messages, isLoading }: Props) {
  if (!isLoading) return null;

  // Only look at messages since the last user turn
  const lastUserIdx = messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
  if (lastUserIdx === -1) return null;

  const assistantMessages = messages.slice(lastUserIdx + 1).filter((m) => m.role === "assistant");
  if (assistantMessages.length === 0) return null;

  // Collect all tool invocations across multi-step responses, last state wins per call ID
  const seen = new Map<string, ToolInvocation>();
  for (const msg of assistantMessages) {
    for (const inv of getInvocations(msg)) {
      seen.set(inv.toolCallId, inv);
    }
  }

  if (seen.size === 0) return null;

  const chips = Array.from(seen.values());

  return (
    <div className="flex justify-start print:hidden">
      <div className="flex flex-wrap gap-1.5 px-1 py-1">
        {chips.map((inv) => {
          const isDone = inv.state === "result";
          return (
            <span
              key={inv.toolCallId}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: isDone ? "var(--color-text-muted)" : "var(--color-text)",
              }}
            >
              {isDone ? (
                <span className="text-[10px] leading-none" style={{ color: "var(--color-positive)" }}>✓</span>
              ) : (
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full animate-spin shrink-0"
                  style={{ border: "1px solid var(--color-text-muted)", borderTopColor: "transparent" }}
                />
              )}
              {toolLabel(inv.toolName)}{isDone ? "" : "..."}
            </span>
          );
        })}
      </div>
    </div>
  );
});

export default ToolStatusBar;
