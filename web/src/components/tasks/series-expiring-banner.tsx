"use client";

import { useState, useTransition } from "react";
import { CalendarX, Check, X } from "lucide-react";
import type { TaskSeries } from "@/lib/types";
import { cadenceLabel, daysUntilEnd, type Freq } from "@/lib/tasks/recurrence";

interface Props {
  series: TaskSeries[];
  today: string;
  extendAction: (
    seriesId: string,
    endsOn: string | null,
  ) => Promise<{ error?: string; ends_on?: string }>;
  dismissAction: (seriesId: string) => Promise<{ error?: string }>;
}

/**
 * The #689 notice: a series about to expire, with Extend and Let it end.
 *
 * This is the actual point of recurring tasks having an end date. Without it an expiring series
 * fails silently — the chore stops appearing and nobody notices until the plants are dead.
 */
export default function SeriesExpiringBanner({
  series,
  today,
  extendAction,
  dismissAction,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  // Hide a row the moment it is actioned. The server revalidates, but the optimistic removal is
  // what makes Extend feel like it did something rather than leaving the warning sitting there.
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState("");
  const [isPending, startTransition] = useTransition();

  const visible = series.filter((s) => !handled.has(s.id));
  if (!visible.length) return null;

  function act(seriesId: string, fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      setHandled((prev) => new Set(prev).add(seriesId));
      setPickerFor(null);
      setPickedDate("");
    });
  }

  return (
    <div
      role="status"
      style={{
        border: "1px solid var(--rule)",
        borderLeft: "2px solid var(--accent)",
        borderRadius: "var(--r-1)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {visible.map((s) => {
        const left = daysUntilEnd(s.ends_on, today);
        const when =
          left === null
            ? ""
            : left <= 0
              ? "ends today"
              : `ends in ${left} day${left === 1 ? "" : "s"}`;
        return (
          <div
            key={s.id}
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
          >
            <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
              <CalendarX
                size={14}
                style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}
                aria-hidden
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "var(--t-body)", color: "var(--color-text)" }}>{s.title}</p>
                <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
                  {cadenceLabel({
                    freq: s.freq as Freq,
                    interval: s.interval,
                    byweekday: s.byweekday,
                  })}{" "}
                  — {when} ({s.ends_on})
                </p>
              </div>
            </div>

            <div
              className="flex items-center flex-wrap"
              style={{ gap: "var(--space-2)", paddingLeft: 22 }}
            >
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(s.id, () => extendAction(s.id, null))}
                className="transition-opacity disabled:opacity-40 hover:opacity-80"
                style={{
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  background: "var(--accent)",
                  color: "var(--color-text-on-cta)",
                  borderRadius: "var(--r-1)",
                  padding: "4px 10px",
                }}
              >
                <Check size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden />
                Extend 3 months
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setPickerFor(pickerFor === s.id ? null : s.id);
                  setPickedDate(s.ends_on ?? "");
                }}
                className="transition-opacity disabled:opacity-40 hover:opacity-80"
                style={{
                  fontSize: "var(--t-micro)",
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--r-1)",
                  padding: "4px 10px",
                  color: "var(--color-text-muted)",
                }}
                aria-expanded={pickerFor === s.id}
              >
                Pick a date
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => act(s.id, () => dismissAction(s.id))}
                className="transition-opacity disabled:opacity-40 hover:opacity-80"
                style={{
                  fontSize: "var(--t-micro)",
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-faint)",
                  padding: "4px 6px",
                }}
                title="Stop warning about this series — it is meant to end"
              >
                <X size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden />
                Let it end
              </button>
            </div>

            {pickerFor === s.id && (
              <div
                className="flex items-center flex-wrap"
                style={{ gap: "var(--space-2)", paddingLeft: 22 }}
              >
                <input
                  type="date"
                  aria-label="New end date"
                  value={pickedDate}
                  min={today}
                  onChange={(e) => setPickedDate(e.target.value)}
                  style={{
                    fontSize: "var(--t-micro)",
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-1)",
                    padding: "4px 8px",
                    color: "var(--color-text)",
                  }}
                />
                <button
                  type="button"
                  disabled={isPending || !pickedDate}
                  onClick={() => act(s.id, () => extendAction(s.id, pickedDate))}
                  className="transition-opacity disabled:opacity-30 hover:opacity-80"
                  style={{
                    fontSize: "var(--t-micro)",
                    fontWeight: 500,
                    background: "var(--accent)",
                    color: "var(--color-text-on-cta)",
                    borderRadius: "var(--r-1)",
                    padding: "4px 10px",
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}

      {error && <p style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}>{error}</p>}
    </div>
  );
}
