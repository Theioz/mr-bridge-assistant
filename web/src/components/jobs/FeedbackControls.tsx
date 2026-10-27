"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FEEDBACK,
  FEEDBACK_LABEL,
  feedbackStatus,
  type Feedback,
  type JobRow,
} from "@/lib/jobs/jobs";
import { btnStyle, inputStyle } from "@/components/jobs/styles";

/**
 * Want this / Not for me / Wrong reason, plus an optional note, for one filtered role. Saved with
 * PATCH /api/jobs/<id>; the agent picks it up in the next morning run (Want this -> into the
 * tracker as To apply). Tapping the selected choice again clears it.
 */
export function FeedbackControls({
  role,
}: {
  role: Pick<JobRow, "id" | "feedback" | "feedback_note" | "processed_at" | "status">;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(role.feedback);
  const [note, setNote] = useState(role.feedback_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    feedback !== role.feedback || (note.trim() || null) !== (role.feedback_note ?? null);

  async function save(next: Feedback | null, nextNote: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: next, note: nextNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose(f: Feedback) {
    const next = feedback === f ? null : f;
    setFeedback(next);
    // Save straight away unless a note is being written; the note has its own Save button.
    if (!note.trim()) void save(next, "");
  }

  const status = feedbackStatus(role);

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <div
        role="group"
        aria-label="Your feedback"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
      >
        {FEEDBACK.map((f) => {
          const on = feedback === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => choose(f)}
              style={{
                ...btnStyle,
                borderColor: on ? "var(--color-primary)" : "var(--rule-soft)",
                color: on ? "var(--color-primary)" : "var(--color-text)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {FEEDBACK_LABEL[f]}
            </button>
          );
        })}
      </div>
      {feedback && (
        <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional, read by the agent)"
            aria-label="Note for the agent"
            maxLength={1000}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => save(feedback, note)}
            style={btnStyle}
          >
            Save
          </button>
        </div>
      )}
      {(status || error) && (
        <p
          role={error ? "alert" : undefined}
          style={{
            fontSize: "var(--t-micro)",
            margin: "var(--space-1) 0 0",
            color: error ? "var(--color-danger)" : "var(--color-text-muted)",
          }}
        >
          {error ?? status}
        </p>
      )}
    </div>
  );
}
