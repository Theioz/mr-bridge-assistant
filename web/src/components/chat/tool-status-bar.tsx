"use client";

import { memo } from "react";
import type { UIMessage } from "ai";

export const TOOL_LABELS: Record<string, string> = {
  get_tasks: "Fetching tasks",
  add_task: "Adding task",
  complete_task: "Completing task",
  get_habits_today: "Fetching habits",
  log_habit: "Logging habit",
  get_fitness_summary: "Fetching fitness data",
  get_profile: "Loading profile",
  update_profile: "Updating profile",
  search_gmail: "Searching email",
  get_email_body: "Reading email",
  list_calendar_events: "Checking calendar",
  create_calendar_event: "Creating calendar event",
  update_calendar_event: "Updating calendar event",
  delete_calendar_event: "Deleting calendar event",
  get_recipes: "Searching recipes",
  get_today_meals: "Fetching meals",
  get_session_history: "Loading session history",
  get_workout_plan: "Loading workout plan",
  assign_workout: "Assigning workout",
  update_workout_exercise: "Updating workout",
  get_workout_history: "Loading workout history",
  get_stock_quote: "Fetching stock quote",
  get_sports_data: "Fetching sports data",
};

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

function formatShortDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function datePreview(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as { date?: unknown; day?: unknown; timeMin?: unknown };
  const raw = obj.date ?? obj.day ?? obj.timeMin;
  if (typeof raw !== "string") return null;
  const d = formatShortDate(raw);
  return d ? `for ${d}` : null;
}

// Opt-in, per-tool preview of safe argument summaries. Tools not listed here
// show only the verb label — defaults to no preview so user content (email
// queries, task bodies, journal entries) never leaks into the status bar.
const TOOL_INPUT_PREVIEW: Record<string, (input: unknown) => string | null> = {
  list_calendar_events: datePreview,
  get_habits_today: datePreview,
  get_fitness_summary: datePreview,
  get_today_meals: datePreview,
  get_workout_plan: datePreview,
  get_workout_history: datePreview,
  get_recipes: datePreview,
  get_stock_quote: (input) => {
    if (!input || typeof input !== "object") return null;
    const obj = input as { symbol?: unknown; ticker?: unknown };
    const sym = obj.symbol ?? obj.ticker;
    return typeof sym === "string" && sym.length > 0 ? `for ${sym.toUpperCase()}` : null;
  },
  get_sports_data: (input) => {
    if (!input || typeof input !== "object") return null;
    const obj = input as { team?: unknown; league?: unknown; sport?: unknown };
    const val = obj.team ?? obj.league ?? obj.sport;
    return typeof val === "string" && val.length > 0 ? `for ${val}` : null;
  },
};

function previewFor(toolName: string, input: unknown): string | null {
  const fn = TOOL_INPUT_PREVIEW[toolName];
  if (!fn) return null;
  const raw = fn(input);
  if (!raw) return null;
  return raw.length > 25 ? `${raw.slice(0, 25)}…` : raw;
}

// v5/v6 tool UI part shape: type is `tool-${toolName}`, state is one of
// 'input-streaming' | 'input-available' | 'output-available' | 'output-error'.
// Each part carries a toolCallId plus (when available) the tool input object.
type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

export type ToolUIPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
};

function isToolPart(part: { type: string }): part is ToolUIPart {
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

function toolNameFromType(type: string): string {
  return type.slice("tool-".length);
}

interface Props {
  messages: UIMessage[];
  isLoading: boolean;
}

const ToolStatusBar = memo(function ToolStatusBar({ messages, isLoading }: Props) {
  if (!isLoading) return null;

  const lastUserIdx = messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
  if (lastUserIdx === -1) return null;

  const assistantMessages = messages.slice(lastUserIdx + 1).filter((m) => m.role === "assistant");
  if (assistantMessages.length === 0) return null;

  const seen = new Map<string, ToolUIPart>();
  for (const msg of assistantMessages) {
    for (const part of msg.parts) {
      if (isToolPart(part)) {
        seen.set(part.toolCallId, part);
      }
    }
  }

  if (seen.size === 0) return null;

  const chips = Array.from(seen.values());

  return (
    <div className="flex justify-start print:hidden">
      <div
        className="flex flex-wrap"
        style={{
          gap: "var(--space-1)",
          padding: "var(--space-1) 0",
        }}
      >
        {chips.map((part) => {
          const toolName = toolNameFromType(part.type);
          const verb = toolLabel(toolName);
          const isDone = part.state === "output-available";
          const isError = part.state === "output-error";
          const inFlight = !isDone && !isError;

          const preview =
            part.state === "input-available" ? previewFor(toolName, part.input) : null;
          const label = isError
            ? `${verb} failed`
            : isDone
              ? verb
              : preview
                ? `${verb} ${preview}…`
                : `${verb}…`;

          const borderColor = isError
            ? "var(--color-danger)"
            : inFlight
              ? "var(--accent)"
              : "var(--rule-soft)";

          const textColor = isError
            ? "var(--color-danger)"
            : isDone
              ? "var(--color-text-faint)"
              : "var(--color-text)";

          return (
            <span
              key={part.toolCallId}
              className="inline-flex items-center rounded-full tnum"
              style={{
                gap: "var(--space-1)",
                padding: "var(--space-1) var(--space-3)",
                fontSize: "var(--t-micro)",
                background: "transparent",
                border: `1px solid ${borderColor}`,
                color: textColor,
                transition: `border-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)`,
              }}
            >
              {isDone ? (
                <span
                  aria-hidden
                  style={{ fontSize: 10, lineHeight: 1, color: "var(--color-positive)" }}
                >
                  ✓
                </span>
              ) : isError ? (
                <span
                  aria-hidden
                  style={{ fontSize: 10, lineHeight: 1, color: "var(--color-danger)" }}
                >
                  ✕
                </span>
              ) : (
                <span
                  aria-hidden
                  className="inline-block rounded-full animate-spin shrink-0"
                  style={{
                    width: 10,
                    height: 10,
                    border: "1.5px solid var(--accent)",
                    borderTopColor: "transparent",
                  }}
                />
              )}
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
});

export default ToolStatusBar;
