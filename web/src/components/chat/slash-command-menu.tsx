"use client";

import { useEffect, useRef } from "react";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "weekly",   description: "Weekly review summary",                                         usage: "/weekly" },
  { name: "briefing", description: "Today's full briefing (weather, schedule, tasks, habits, recovery)", usage: "/briefing" },
  { name: "workout",  description: "Log a workout",                                                 usage: "/workout [type]" },
  { name: "habit",    description: "Mark a habit as done today",                                    usage: "/habit [name]" },
  { name: "task",     description: "Add a new task",                                                usage: "/task [title]" },
  { name: "weight",   description: "Log a weigh-in",                                               usage: "/weight [lbs]" },
  { name: "meal",     description: "Log a meal",                                                    usage: "/meal [description]" },
  { name: "journal",  description: "Open the journal prompt",                                       usage: "/journal" },
];

interface Props {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

export default function SlashCommandMenu({ commands, activeIndex, onSelect, onHover }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="absolute left-0 right-0 overflow-hidden"
      style={{
        bottom: "100%",
        marginBottom: "var(--space-2)",
        borderRadius: "var(--r-2)",
        background: "var(--color-surface)",
        border: "1px solid var(--rule)",
        boxShadow: "var(--shadow-lg)",
        maxHeight: "calc(6 * 2.75rem)",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      {commands.map((cmd, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={cmd.name}
            ref={active ? activeRef : undefined}
            role="option"
            aria-selected={active}
            type="button"
            className="w-full text-left flex items-baseline"
            style={{
              position: "relative",
              gap: "var(--space-3)",
              padding: "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) + 2px)",
              background: active ? "var(--hover-subtle)" : "transparent",
              border: "none",
              transition: `background-color var(--motion-fast) var(--ease-out-quart)`,
              cursor: "pointer",
              minHeight: 44,
            }}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => onSelect(cmd)}
          >
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: "var(--space-1)",
                  bottom: "var(--space-1)",
                  width: 2,
                  borderRadius: 1,
                  background: "var(--accent)",
                }}
              />
            )}
            <span
              style={{
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                color: active ? "var(--accent)" : "var(--color-text)",
                flexShrink: 0,
              }}
            >
              {cmd.usage}
            </span>
            <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              {cmd.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
