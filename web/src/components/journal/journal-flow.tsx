"use client";

import { useState, useTransition } from "react";
import type { JournalResponses } from "@/lib/types";

const PROMPTS: { slug: keyof JournalResponses; question: string; placeholder: string }[] = [
  {
    slug: "best_moment",
    question: "What was the best thing that happened today?",
    placeholder: "A moment, win, or interaction that stood out...",
  },
  {
    slug: "challenge",
    question: "What was the most difficult part of your day, and how did you handle it?",
    placeholder: "What was hard, and what did you do about it...",
  },
  {
    slug: "small_gratitude",
    question: "What's one small thing you noticed today that you might usually overlook?",
    placeholder: "Something simple — a detail, a feeling, a moment...",
  },
  {
    slug: "energy_check",
    question: "What gave you energy today? What drained you?",
    placeholder: "Energy: ... / Drain: ...",
  },
  {
    slug: "tomorrow_focus",
    question: "What's one intention or priority for tomorrow?",
    placeholder: "One clear focus for tomorrow...",
  },
];

interface Props {
  date: string;
  initialResponses: JournalResponses;
  saveAction: (date: string, responses: JournalResponses) => Promise<{ error?: string }>;
}

export default function JournalFlow({ date, initialResponses, saveAction }: Props) {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<JournalResponses>(initialResponses);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const prompt = PROMPTS[step];
  const isLast = step === PROMPTS.length - 1;
  const currentValue = responses[prompt.slug] ?? "";

  function handleChange(value: string) {
    setResponses((prev) => ({ ...prev, [prompt.slug]: value }));
  }

  function handleNext() {
    if (step < PROMPTS.length - 1) setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveAction(date, responses);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  if (saved) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center space-y-3">
        <p className="text-neutral-100 font-medium">Entry saved</p>
        <p className="text-sm text-neutral-500">Your journal entry for today has been recorded.</p>
        <button
          onClick={() => setSaved(false)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Edit entry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">
            {step + 1} of {PROMPTS.length}
          </span>
        </div>
        <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / PROMPTS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <p className="text-sm font-medium text-neutral-100 leading-snug">{prompt.question}</p>

      {/* Answer */}
      <textarea
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={prompt.placeholder}
        rows={4}
        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 resize-none focus:outline-none focus:border-neutral-500 transition-colors"
        autoFocus
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className="text-sm text-neutral-500 hover:text-neutral-300 disabled:opacity-0 transition-colors"
        >
          ← Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-blue-400 transition-colors"
          >
            {isPending ? "Saving..." : "Save Entry"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="text-sm text-neutral-300 hover:text-neutral-100 transition-colors"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
