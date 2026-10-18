import type { MacroTotals } from "./types";
import { roundOrDash } from "./utils";

// Combined total — hairline row, no card.
export default function CombinedTotal({
  combined,
  fiber,
  sugar,
}: {
  combined: MacroTotals;
  fiber: number | null;
  sugar: number | null;
}) {
  return (
    <div
      style={{
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule)",
        fontSize: "var(--t-meta)",
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>Combined: </span>
      <span className="tnum" style={{ color: "var(--color-text)", fontWeight: 600 }}>
        {Math.round(combined.calories)} cal · {Math.round(combined.protein_g)}g P ·{" "}
        {Math.round(combined.carbs_g)}g C · {Math.round(combined.fat_g)}g F
      </span>
      {(fiber !== null || sugar !== null) && (
        <div
          className="tnum"
          style={{
            marginTop: 2,
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
        >
          Fiber {roundOrDash(fiber, 1)}g · Sugar {roundOrDash(sugar, 1)}g
        </div>
      )}
    </div>
  );
}
