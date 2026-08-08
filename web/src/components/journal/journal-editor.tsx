"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import type { JournalResponses } from "@/lib/types";
import type { JournalPrompt } from "@/lib/journal/prompts";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  date: string;
  /**
   * Legacy sectioned answers. Nothing writes these any more — they are carried
   * through the save untouched so editing a pre-2026-08 entry doesn't erase the
   * prompts it was originally written against.
   */
  initialResponses: JournalResponses;
  initialFreeWrite: string;
  prompts: JournalPrompt[];
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
  prompts,
  saveAction,
  onSubmit,
}: Props) {
  const [freeWrite, setFreeWrite] = useState(initialFreeWrite);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showPrompts, setShowPrompts] = useState(true);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = freeWrite.trim().split(/\s+/).filter(Boolean).length;
  const isEmpty = !freeWrite.trim();

  const triggerSave = useCallback(
    (fw: string) => {
      startTransition(async () => {
        setSaveStatus("saving");
        await saveAction(date, initialResponses, fw);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      });
    },
    [date, initialResponses, saveAction],
  );

  function scheduleAutoSave(fw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => triggerSave(fw), 1500);
  }

  function handleFreeWriteChange(value: string) {
    setFreeWrite(value);
    scheduleAutoSave(value);
  }

  /**
   * A tapped prompt is dropped in as a line to write under, not as a field.
   * The caret lands after it so typing continues straight into the answer.
   */
  function insertPrompt(text: string) {
    const trimmed = freeWrite.replace(/\s+$/, "");
    const next = trimmed ? `${trimmed}\n\n${text}\n` : `${text}\n`;
    setFreeWrite(next);
    scheduleAutoSave(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      el.scrollTop = el.scrollHeight;
    });
  }

  async function handleSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setSaveStatus("saving");
    await saveAction(date, initialResponses, freeWrite);
    setSaveStatus("saved");
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
      {/* Save status — sits alone now that the mode tabs are gone */}
      <div
        className="flex print:hidden"
        style={{
          justifyContent: "flex-end",
          minHeight: 20,
          marginBottom: "var(--space-3)",
        }}
      >
        <span
          className="tnum transition-opacity"
          style={{
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

      {/* Suggestions — inspiration, not fields. Dismissible, never required. */}
      {showPrompts && prompts.length > 0 && (
        <div
          className="print:hidden"
          style={{
            marginBottom: "var(--space-5)",
            paddingBottom: "var(--space-4)",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div
            className="flex"
            style={{
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "var(--space-3)",
            }}
          >
            <span className="db-section-label" style={{ color: "var(--color-text-muted)" }}>
              Could write about
            </span>
            <button
              type="button"
              onClick={() => setShowPrompts(false)}
              className="hover-text-brighten transition-colors"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                background: "transparent",
                border: "none",
                padding: "var(--space-1)",
                cursor: "pointer",
                transitionDuration: "var(--motion-fast)",
                transitionTimingFunction: "var(--ease-out-quart)",
              }}
            >
              Hide
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insertPrompt(p.text)}
                className="hover-text-brighten transition-colors"
                style={{
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--r-2)",
                  border: "1px solid var(--rule-soft)",
                  background: "transparent",
                  color: "var(--color-text-muted)",
                  fontSize: "var(--t-meta)",
                  lineHeight: 1.45,
                  cursor: "pointer",
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              >
                {p.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={freeWrite}
        onChange={(e) => handleFreeWriteChange(e.target.value)}
        placeholder="Whatever's on your mind."
        rows={18}
        aria-label="Journal entry"
        className="journal-field"
        style={{ fontSize: "var(--t-body)", lineHeight: 1.75 }}
      />

      <div
        className="flex print:hidden"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "var(--space-2)",
        }}
      >
        {!showPrompts && prompts.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowPrompts(true)}
            className="hover-text-brighten transition-colors"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transitionDuration: "var(--motion-fast)",
              transitionTimingFunction: "var(--ease-out-quart)",
            }}
          >
            Show suggestions
          </button>
        ) : (
          <span />
        )}
        <p
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </p>
      </div>

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
