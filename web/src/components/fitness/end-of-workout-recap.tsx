"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Props {
  sessionId: string | null;
  initialPerceivedEffort: number | null;
  initialNotes: string | null;
  completedAt: string | null;
}

export function EndOfWorkoutRecap({
  sessionId,
  initialPerceivedEffort,
  initialNotes,
  completedAt,
}: Props) {
  const router = useRouter();
  const [effort, setEffort] = useState<number | null>(initialPerceivedEffort);
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(completedAt);

  if (!sessionId) {
    return (
      <p
        style={{
          fontSize: 11,
          color: "var(--color-text-faint, var(--color-text-muted))",
          fontStyle: "italic",
          marginTop: 8,
        }}
      >
        Log a set above to open the end-of-workout recap.
      </p>
    );
  }

  async function save() {
    setErr(null);
    setPending(true);
    try {
      const res = await fetch("/api/strength-sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          perceived_effort: effort,
          notes: notes.trim() === "" ? null : notes,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErr(j?.error ?? `Request failed: ${res.status}`);
        return;
      }
      const data = await res.json();
      setSavedAt(data?.completed_at ?? new Date().toISOString());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px dashed var(--color-border)",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest"
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.07em",
          color: "var(--color-text-faint, var(--color-text-muted))",
          marginBottom: 8,
        }}
      >
        End of workout
      </p>

      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Perceived effort{" "}
          <span style={{ color: "var(--color-text-faint)" }}>(1 easy — 10 max)</span>
        </label>
        <div className="flex items-center gap-1.5 print:hidden" style={{ flexWrap: "wrap" }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = effort === n;
            return (
              <button
                key={n}
                onClick={() => setEffort(active ? null : n)}
                className="cursor-pointer hover-text-brighten"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  border: "1px solid var(--color-border)",
                  background: active ? "var(--color-primary)" : "var(--color-surface-raised)",
                  color: active ? "var(--color-text-on-cta)" : "var(--color-text)",
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
                aria-pressed={active}
                aria-label={`Perceived effort ${n}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label
          htmlFor={`recap-notes-${sessionId}`}
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            display: "block",
            marginBottom: 4,
          }}
        >
          Notes{" "}
          <span style={{ color: "var(--color-text-faint)" }}>(optional — how did it feel?)</span>
        </label>
        <textarea
          id={`recap-notes-${sessionId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input-focus-ring print:hidden"
          style={{
            width: "100%",
            fontSize: 12,
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg, var(--color-surface))",
            color: "var(--color-text)",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.5,
          }}
        />
      </div>

      <div className="flex items-center gap-3 print:hidden">
        <button
          onClick={save}
          disabled={pending}
          className="cursor-pointer hover-text-brighten"
          style={{
            background: "var(--color-primary)",
            border: "1px solid var(--color-primary)",
            color: "var(--color-text-on-cta)",
            fontSize: 12,
            padding: "5px 12px",
            borderRadius: 6,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : null}
          {savedAt ? "Update recap" : "Save recap"}
        </button>
        {savedAt && (
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
            Saved {fmtTime(savedAt)}
          </span>
        )}
      </div>

      {err && <p style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}
