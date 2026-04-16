import type { StrengthSession, StrengthSessionSet } from "@/lib/types";
import type { WeightUnit } from "@/lib/units";
import { kgToDisplay } from "@/lib/units";

interface Props {
  sessions: (StrengthSession & { sets: StrengthSessionSet[] })[];
  unit: WeightUnit;
}

export function RecentSessionsList({ sessions, unit }: Props) {
  return (
    <section
      className="flex flex-col"
      style={{ gap: "var(--space-3)", minWidth: 0 }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: "var(--t-h2)",
          fontWeight: 600,
          color: "var(--color-text)",
          letterSpacing: "-0.01em",
        }}
      >
        Recent sessions
      </h2>

      {sessions.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            fontStyle: "italic",
          }}
        >
          No strength sessions logged yet. Log a set during your next workout to
          get started.
        </p>
      ) : (
        <div>
          {sessions.map((s, idx) => {
            const exerciseCount = new Set(
              s.sets.map((set) => set.exercise_name.toLowerCase())
            ).size;
            const totalSets = s.sets.length;
            const topLift = pickTopLift(s.sets, unit);
            return (
              <div
                key={s.id}
                className="db-row"
                style={{
                  gridTemplateColumns: "72px 1fr auto",
                  alignItems: "baseline",
                  borderTop: idx === 0 ? undefined : "1px solid var(--rule-soft)",
                }}
              >
                <span
                  className="tnum"
                  style={{
                    fontSize: "var(--t-micro)",
                    fontWeight: 500,
                    color: "var(--color-text)",
                  }}
                >
                  {fmtDate(s.performed_on)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p
                    className="tnum"
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} ·{" "}
                    {totalSets} set{totalSets === 1 ? "" : "s"}
                    {topLift && (
                      <>
                        {" "}· top: {topLift.exercise} {topLift.weight} {unit} ×{" "}
                        {topLift.reps}
                      </>
                    )}
                  </p>
                  {s.notes && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-faint)",
                        fontStyle: "italic",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.notes}
                    </p>
                  )}
                </div>
                {s.perceived_effort != null && (
                  <span
                    className="tnum"
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    RPE {s.perceived_effort}/10
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function pickTopLift(
  sets: StrengthSessionSet[],
  unit: WeightUnit
): { exercise: string; weight: number; reps: number } | null {
  let best: { exercise: string; weight: number; reps: number } | null = null;
  for (const s of sets) {
    if (s.weight_kg == null || s.reps == null) continue;
    const display = kgToDisplay(s.weight_kg, unit);
    if (display == null) continue;
    if (!best || display > best.weight) {
      best = { exercise: s.exercise_name, weight: display, reps: s.reps };
    }
  }
  return best;
}
