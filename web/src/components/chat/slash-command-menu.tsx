"use client";

import { useEffect, useRef } from "react";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string; // display label, e.g. "/workout [type]"
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
      className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl overflow-hidden"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-lg)",
        maxHeight: "calc(6 * 2.75rem)",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          ref={i === activeIndex ? activeRef : undefined}
          role="option"
          aria-selected={i === activeIndex}
          type="button"
          className="w-full text-left px-4 py-2.5 flex items-baseline gap-3 transition-colors duration-100"
          style={{
            background: i === activeIndex ? "var(--color-primary-dim)" : "transparent",
            borderLeft: `2px solid ${i === activeIndex ? "var(--color-primary)" : "transparent"}`,
          }}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            // prevent input blur before click fires
            e.preventDefault();
          }}
          onClick={() => onSelect(cmd)}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-primary)",
              fontFamily: "ui-monospace, monospace",
              flexShrink: 0,
            }}
          >
            {cmd.usage}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {cmd.description}
          </span>
        </button>
      ))}
    </div>
  );
}
