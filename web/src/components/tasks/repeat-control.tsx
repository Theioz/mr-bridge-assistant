"use client";

import { WEEKDAY_SHORT, type Freq, type SeriesDraft } from "@/lib/tasks/recurrence";

interface Props {
  freq: Freq;
  interval: number;
  byweekday: number[];
  endsOn: string;
  startsOn: string;
  onChange: (
    patch: Partial<{ freq: Freq; interval: number; byweekday: number[]; endsOn: string }>,
  ) => void;
}

const FREQ_OPTIONS: { key: Freq; label: string }[] = [
  { key: "daily", label: "day" },
  { key: "weekly", label: "week" },
  { key: "monthly", label: "month" },
];

/**
 * The cadence editor, shared by the add form and the task-item series editor.
 *
 * Deliberately plain: three freqs, an interval, weekday chips for weekly, and an end date. The end
 * date is the field that earns the whole feature (#689), so it is always visible rather than
 * hidden behind an "advanced" disclosure.
 */
export default function RepeatControl({
  freq,
  interval,
  byweekday,
  endsOn,
  startsOn,
  onChange,
}: Props) {
  function toggleDay(d: number) {
    const next = byweekday.includes(d) ? byweekday.filter((x) => x !== d) : [...byweekday, d];
    onChange({ byweekday: next.sort((a, b) => a - b) });
  }

  const inputStyle = {
    fontSize: "var(--t-micro)",
    background: "transparent",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-1)",
    padding: "4px 8px",
    color: "var(--color-text)",
  } as const;

  return (
    <div
      className="flex items-center flex-wrap"
      style={{ gap: "var(--space-2)", paddingBottom: "var(--space-3)" }}
    >
      <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>every</span>

      <input
        type="number"
        min={1}
        aria-label="Repeat interval"
        value={interval}
        onChange={(e) => onChange({ interval: Math.max(1, Number(e.target.value) || 1) })}
        style={{ ...inputStyle, width: 56 }}
      />

      <select
        aria-label="Repeat frequency"
        value={freq}
        onChange={(e) => onChange({ freq: e.target.value as Freq })}
        className="focus:outline-none"
        style={inputStyle}
      >
        {FREQ_OPTIONS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
            {interval === 1 ? "" : "s"}
          </option>
        ))}
      </select>

      {freq === "weekly" && (
        <div className="flex items-center" style={{ gap: 2 }} role="group" aria-label="Repeat on">
          {WEEKDAY_SHORT.map((label, d) => {
            const on = byweekday.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                title={label}
                style={{
                  fontSize: "var(--t-micro)",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${on ? "var(--accent)" : "var(--rule)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--color-text-on-cta)" : "var(--color-text-faint)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>until</span>
      <input
        type="date"
        aria-label="Repeat end date"
        value={endsOn}
        min={startsOn || undefined}
        onChange={(e) => onChange({ endsOn: e.target.value })}
        style={{
          ...inputStyle,
          color: endsOn ? "var(--color-text)" : "var(--color-text-faint)",
          width: 140,
        }}
      />
      {!endsOn && (
        <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
          open-ended — no expiry warning
        </span>
      )}
    </div>
  );
}

/** Build the draft a server action expects from this control's state. */
export function toDraft(
  freq: Freq,
  interval: number,
  byweekday: number[],
  startsOn: string,
  endsOn: string,
): SeriesDraft {
  return {
    freq,
    interval,
    byweekday: freq === "weekly" ? byweekday : [],
    starts_on: startsOn,
    ends_on: endsOn || null,
  };
}
