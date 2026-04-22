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

type Tab = "reflect" | "freewrite";
type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  date: string;
  initialResponses: JournalResponses;
  initialFreeWrite: string;
  saveAction: (
    date: string,
    responses: JournalResponses,
    freeWrite: string,
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
  const [tab, setTab] = useState<Tab>("reflect");
  const [responses, setResponses] = useState<JournalResponses>(initialResponses);
  const [freeWrite, setFreeWrite] = useState(initialFreeWrite);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filledCount = PROMPTS.filter((p) => responses[p.slug]?.trim()).length;
  const wordCount = freeWrite.trim().split(/\s+/).filter(Boolean).length;
  const isEmpty = Object.values(responses).every((v) => !v?.trim()) && !freeWrite.trim();

  const triggerSave = useCallback(
    (r: JournalResponses, fw: string) => {
      startTransition(async () => {
        setSaveStatus("saving");
        await saveAction(date, r, fw);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      });
    },
    [date, saveAction],
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div data-print-flat="">
      {/* Inner tab bar — hairline rule with amber underline on active; save status on the right */}
      <div
        className="flex print:hidden"
        style={{
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--rule-soft)",
          marginBottom: "var(--space-5)",
        }}
      >
        <div
          role="tablist"
          aria-label="Journal mode"
          style={{ display: "flex", gap: "var(--space-5)" }}
        >
          {(
            [
              ["reflect", "Reflect"],
              ["freewrite", "Free Write"],
            ] as [Tab, string][]
          ).map(([t, label]) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t)}
                className="transition-colors"
                style={{
                  minHeight: 44,
                  padding: "var(--space-2) var(--space-1)",
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--accent-text)" : "var(--color-text-faint)",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -1,
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Save status */}
        <span
          className="tnum transition-opacity"
          style={{
            paddingBottom: "var(--space-2)",
            fontSize: "var(--t-micro)",
            letterSpacing: "0.04em",
            color: saveStatus === "saved" ? "var(--color-positive)" : "var(--color-text-faint)",
            opacity: saveStatus === "idle" ? 0 : 1,
            transitionDuration: "var(--motion-base)",
            transitionTimingFunction: "var(--ease-out-quart)",
          }}
        >
          {saveStatus === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      {/* Reflect tab */}
      {tab === "reflect" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {/* Progress row — accent dots + tabular count */}
          <div
            className="flex print:hidden"
            style={{ alignItems: "center", gap: "var(--space-2)" }}
          >
            {PROMPTS.map((p) => (
              <span
                key={p.slug}
                className="transition-colors"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "9999px",
                  background: responses[p.slug]?.trim() ? "var(--accent)" : "var(--rule)",
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              />
            ))}
            <span
              className="tnum"
              style={{
                marginLeft: "var(--space-2)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              {filledCount} / {PROMPTS.length}
            </span>
          </div>

          {/* Prompts — each as a quiet section header + flat textarea; hairlines between */}
          {PROMPTS.map((p, i) => (
            <div
              key={p.slug}
              style={{
                paddingTop: i > 0 ? "var(--space-5)" : 0,
                borderTop: i > 0 ? "1px solid var(--rule-soft)" : "none",
              }}
            >
              <label
                htmlFor={`journal-${p.slug}`}
                className="db-section-label"
                style={{
                  display: "block",
                  margin: "0 0 var(--space-2)",
                  color: "var(--color-text-muted)",
                }}
              >
                {p.question}
              </label>
              <textarea
                id={`journal-${p.slug}`}
                value={responses[p.slug] ?? ""}
                onChange={(e) => handleResponseChange(p.slug, e.target.value)}
                placeholder={p.placeholder}
                rows={3}
                className="journal-field"
              />
            </div>
          ))}
        </div>
      )}

      {/* Free Write tab */}
      {tab === "freewrite" && (
        <div>
          <textarea
            value={freeWrite}
            onChange={(e) => handleFreeWriteChange(e.target.value)}
            placeholder="Write anything on your mind — no structure, no prompts. Just you and the page."
            rows={18}
            className="journal-field"
            style={{ fontSize: "var(--t-body)", lineHeight: 1.75 }}
          />
          <p
            className="tnum"
            style={{
              marginTop: "var(--space-2)",
              textAlign: "right",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </p>
        </div>
      )}

      {/* Submit button — filled accent CTA, 44px min-height */}
      <div className="print:hidden" style={{ marginTop: "var(--space-6)" }}>
        <button
          onClick={handleSubmit}
          disabled={saveStatus === "saving" || isEmpty}
          className="transition-opacity"
          style={{
            width: "100%",
            minHeight: 44,
            padding: "var(--space-3) var(--space-5)",
            borderRadius: "var(--r-2)",
            border: "none",
            background: "var(--accent)",
            color: "var(--color-text-on-cta)",
            fontSize: "var(--t-meta)",
            fontWeight: 500,
            letterSpacing: "0.01em",
            opacity: saveStatus === "saving" || isEmpty ? 0.5 : 1,
            cursor: saveStatus === "saving" || isEmpty ? "not-allowed" : "pointer",
            transitionDuration: "var(--motion-fast)",
            transitionTimingFunction: "var(--ease-out-quart)",
          }}
        >
          {saveStatus === "saving" ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
