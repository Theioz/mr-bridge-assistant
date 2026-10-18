import { MEAL_TYPES, type MealType } from "./types";
import { pillBtnBase } from "./styles";

export default function MealTypePills({
  value,
  onChange,
}: {
  value: MealType;
  onChange: (t: MealType) => void;
}) {
  return (
    <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
      {MEAL_TYPES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            ...pillBtnBase,
            background: value === t ? "var(--accent)" : "transparent",
            color: value === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
            borderColor: value === t ? "var(--accent)" : "var(--rule)",
          }}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}
