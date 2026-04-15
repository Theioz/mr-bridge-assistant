"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import type { JournalResponses } from "@/lib/types";

const PROMPTS: {
  slug: keyof JournalResponses;
  question: string;
  placeholder: string;
}[] = [
  {
    slug: "best_moment",
    question: "Best moment",
    placeholder: "A win, interaction, or memory that stood out...",
  },
  {
    slug: "challenge",
    question: "Biggest challenge",
    placeholder: "What was hard — and how did you handle it...",
  },
  {
    slug: "small_gratitude",
    question: "Small gratitude",
    placeholder: "Something simple you might usually overlook...",
  },
  {
    slug: "energy_check",
    question: "Energy & drain",
    placeholder: "What gave you energy / what drained you...",
  },
  {
    slug: "tomorrow_focus",
    question: "Tomorrow's focus",
    placeholder: "One clear intention for tomorrow...",
  },
];

type Tab        = "reflect" | "freewrite";
type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  date: string;
  initialResponses: JournalResponses;
  initialFreeWrite: string;
  saveAction: (
    date: string,
    responses: JournalResponses,
    freeWrite: string
  ) => Promise<{ error?: string }>;
  onSubmit?: () => void;
}

export default function JournalEditor({
  date,
  initialResponses,
  initialFreeWrite,
  saveAction,
  onSubmit,
}: Props) {
  const [tab, setTab]               = useState<Tab>("reflect");
  const [responses, setResponses]   = useState<JournalResponses>(initialResponses);
  const [freeWrite, setFreeWrite]   = useState(initialFreeWrite);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [, startTransition]         = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filledCount = PROMPTS.filter((p) => responses[p.slug]?.trim()).length;
  const wordCount   = freeWrite.trim().split(/\s+/).filter(Boolean).length;
  const isEmpty     = Object.values(responses).every((v) => !v?.trim()) && !freeWrite.trim();

  const triggerSave = useCallback(
    (r: JournalResponses, fw: string) => {
      startTransition(async () => {
        setSaveStatus("saving");
        await saveAction(date, r, fw);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      });
    },
    [date, saveAction]
  );

  function scheduleAutoSave(r: JournalResponses, fw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => triggerSave(r, fw), 1500);
  }

  function handleResponseChange(slug: keyof JournalResponses, value: string) {
    const next = { ...responses, [slug]: value };
    setResponses(next);
    scheduleAutoSave(next, freeWrite);
  }

  function handleFreeWriteChange(value: string) {
    setFreeWrite(value);
    scheduleAutoSave(responses, value);
  }

  async function handleSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setSaveStatus("saving");
    await saveAction(date, responses, freeWrite);
    setSaveStatus("saved");
    setResponses({});
    setFreeWrite("");
    onSubmit?.();
  }

  // Clear debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between px-5 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex gap-1">
          {(
            [
              ["reflect",   "Reflect"   ],
              ["freewrite", "Free Write"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: tab === t ? "var(--color-primary-dim)" : "transparent",
                color:      tab === t ? "var(--color-primary)"     : "var(--color-text-muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Save status */}
        <span
          className="text-xs transition-opacity"
          style={{
            color:   saveStatus === "saved" ? "var(--color-positive)" : "var(--color-text-faint)",
            opacity: saveStatus === "idle"  ? 0 : 1,
          }}
        >
          {saveStatus === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      <>
          {/* Reflect tab */}
          {tab === "reflect" && (
            <div className="p-5 space-y-5">
              {/* Progress dots */}
              <div className="flex items-center gap-2">
                {PROMPTS.map((p) => (
                  <span
                    key={p.slug}
                    className="rounded-full transition-colors"
                    style={{
                      width: 8,
                      height: 8,
                      background: responses[p.slug]?.trim()
                        ? "var(--color-primary)"
                        : "var(--color-border)",
                    }}
                  />
                ))}
                <span className="text-xs ml-1" style={{ color: "var(--color-text-faint)" }}>
                  {filledCount} / {PROMPTS.length}
                </span>
              </div>

              {/* All prompts visible */}
              {PROMPTS.map((p) => (
                <div key={p.slug} className="space-y-2">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {p.question}
                  </label>
                  <textarea
                    value={responses[p.slug] ?? ""}
                    onChange={(e) => handleResponseChange(p.slug, e.target.value)}
                    placeholder={p.placeholder}
                    rows={3}
                    className="w-full resize-none text-sm focus:outline-none rounded-lg px-3 py-2.5 transition-colors"
                    style={{
                      background: "var(--color-surface-raised)",
                      border:     "1px solid var(--color-border)",
                      color:      "var(--color-text)",
                      lineHeight: "1.6",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Free Write tab */}
          {tab === "freewrite" && (
            <div className="p-5">
              <textarea
                value={freeWrite}
                onChange={(e) => handleFreeWriteChange(e.target.value)}
                placeholder="Write anything on your mind — no structure, no prompts. Just you and the page."
                rows={14}
                className="w-full resize-none text-sm focus:outline-none rounded-lg px-3 py-2.5"
                style={{
                  background: "var(--color-surface-raised)",
                  border:     "1px solid var(--color-border)",
                  color:      "var(--color-text)",
                  lineHeight: "1.75",
                }}
              />
              <p
                className="text-xs mt-2 text-right"
                style={{ color: "var(--color-text-faint)" }}
              >
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </p>
            </div>
          )}

          {/* Submit button */}
          <div className="px-5 pb-5">
            <button
              onClick={handleSubmit}
              disabled={saveStatus === "saving" || isEmpty}
              className="w-full py-3 rounded-xl text-sm font-medium transition-opacity"
              style={{
                background: "var(--color-primary)",
                color:      "var(--color-text-on-cta)",
                opacity:    saveStatus === "saving" || isEmpty ? 0.5 : 1,
                cursor:     saveStatus === "saving" || isEmpty ? "not-allowed" : "pointer",
              }}
            >
              {saveStatus === "saving" ? "Saving…" : "Submit"}
            </button>
          </div>
        </>
    </div>
  );
}
