import { EyeOff } from "lucide-react";

export interface SilentSeries {
  id: string;
  title: string;
  /** First rule date after the spawn window, YYYY-MM-DD — when the chore reappears. */
  next: string | null;
  endsOn: string | null;
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const label = (d: string) => fmt.format(new Date(`${d}T12:00:00Z`));

/**
 * The #703 notice: a repeating chore that should be on the list and is not, because every date in
 * the spawn window was skipped (archived) or never created. Informational only — skipping is a
 * legitimate thing to do. What was wrong is that nothing could tell you it had happened: the chore
 * simply had no row, exactly like one you are on top of.
 */
export default function SeriesSilentNotice({
  series,
  horizonDays,
}: {
  series: SilentSeries[];
  horizonDays: number;
}) {
  return (
    <div role="status" style={{ marginTop: "var(--space-5)" }}>
      {series.map((s) => (
        <p
          key={s.id}
          className="flex items-start"
          style={{
            gap: "var(--space-2)",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          <EyeOff size={13} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <span>
            <span style={{ color: "var(--color-text)" }}>{s.title}</span> repeats, but nothing is on
            the list: every date in the next {horizonDays} days was skipped or never created.{" "}
            {s.next
              ? `Next: ${label(s.next)}.`
              : s.endsOn
                ? `No more dates before it ends ${label(s.endsOn)}.`
                : ""}
          </span>
        </p>
      ))}
    </div>
  );
}
