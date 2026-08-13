import type { RecipeStep } from "@/lib/types";
import {
  stepListStyle as listStyle,
  stepDurationStyle as durationStyle,
  stepTipsStyle as tipsStyle,
  stepLegacyStyle as legacyStyle,
} from "./step-list-styles";

/**
 * A recipe's method, as numbered steps.
 *
 * The counterpart to IngredientList and the same contract: structured `steps_json` wins, the legacy
 * `instructions` free-text column is the fallback while the backfill runs.
 *
 * Numbering comes from `step`, not array position. A stored order that disagrees with the array is
 * a data bug worth seeing rather than papering over — and it means a caller can hand this component
 * a filtered subset without the numbers silently renumbering themselves.
 *
 * `tips` render under their step in muted text, mirroring how WorkoutExercise.tips already read on
 * the fitness side, so the two planners look like one product.
 */
export function StepList({ steps, text }: { steps?: RecipeStep[] | null; text?: string | null }) {
  if (steps?.length) {
    const ordered = [...steps].sort((a, b) => a.step - b.step);
    return (
      <ol style={listStyle}>
        {ordered.map((s, i) => (
          <li key={i} value={s.step} style={{ marginBottom: "0.35em" }}>
            <span>{s.text}</span>
            {s.duration_mins != null && <span style={durationStyle}> · {s.duration_mins} min</span>}
            {s.tips?.length ? (
              <ul style={tipsStyle}>
                {s.tips.map((t, ti) => (
                  <li key={ti}>{t}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    );
  }

  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  return <p style={legacyStyle}>{trimmed}</p>;
}
