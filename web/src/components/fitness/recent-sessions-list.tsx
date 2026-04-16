import type { StrengthSession, StrengthSessionSet } from "@/lib/types";
import type { WeightUnit } from "@/lib/units";
import { kgToDisplay } from "@/lib/units";

interface Props {
  sessions: (StrengthSession & { sets: StrengthSessionSet[] })[];
  unit: WeightUnit;
}

export function RecentSessionsList({ sessions, unit }: Props) {
  if (sessions.length === 0) {
    return (
      <div
        className="rounded-xl p-5 transition-all duration-200 card-lift"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em", marginBottom: 10 }}
        >
          Recent sessions
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-faint, var(--color-text-muted))", fontStyle: "italic" }}>
          No strength sessions logged yet. Log a set during your next workout to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          Recent sessions
        </p>
      </div>

      <div>
        {sessions.map((s) => {
          const exerciseCount = new Set(s.sets.map((set) => set.exercise_name.toLowerCase())).size;
          const totalSets = s.sets.length;
          const topLift = pickTopLift(s.sets, unit);
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div style={{ minWidth: 72 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text)",
                  }}
                >
                  {fmtDate(s.performed_on)}
                </p>
              </div>

              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"}
                  {topLift && (
                    <>
                      {" "}· top: {topLift.exercise} {topLift.weight} {unit} × {topLift.reps}
                    </>
                  )}
                </p>
                {s.notes && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-faint, var(--color-text-muted))",
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
                <div
                  className="flex-shrink-0"
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  RPE {s.perceived_effort}/10
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
