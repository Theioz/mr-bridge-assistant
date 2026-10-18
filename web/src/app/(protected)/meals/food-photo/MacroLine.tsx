import type { ScanItem } from "./types";
import { roundOrDash } from "./utils";

export default function MacroLine({ item }: { item: ScanItem }) {
  const showNutrients = item.fiber_g !== null || item.sugar_g !== null;
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <span
        className="tnum"
        style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
      >
        {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g P ·{" "}
        {Math.round(item.carbs_g)}g C · {Math.round(item.fat_g)}g F
      </span>
      {showNutrients && (
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          Fiber {roundOrDash(item.fiber_g, 1)}g · Sugar {roundOrDash(item.sugar_g, 1)}g
        </span>
      )}
    </div>
  );
}
