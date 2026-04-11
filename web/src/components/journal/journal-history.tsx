"use client";

import type { JournalEntry } from "@/lib/types";

const PROMPT_LABELS: Record<string, string> = {
  best_moment: "Best moment",
  challenge: "Challenge",
  small_gratitude: "Small gratitude",
  energy_check: "Energy & drain",
  tomorrow_focus: "Tomorrow's focus",
};

interface Props {
  entries: JournalEntry[];
}

export default function JournalHistory({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-600 py-2">No past entries yet.</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const date = new Date(entry.date + "T00:00:00");
        const label = date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        const filledPrompts = Object.entries(entry.responses).filter(([, v]) => v?.trim());

        return (
          <div
            key={entry.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3"
          >
            <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
            <div className="space-y-2">
              {filledPrompts.map(([slug, value]) => (
                <div key={slug}>
                  <p className="text-xs text-neutral-500 mb-0.5">
                    {PROMPT_LABELS[slug] ?? slug}
                  </p>
                  <p className="text-sm text-neutral-300 leading-relaxed">{value}</p>
                </div>
              ))}
              {filledPrompts.length === 0 && (
                <p className="text-sm text-neutral-600">No responses recorded.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
