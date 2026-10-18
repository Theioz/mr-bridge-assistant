import type { ManualEntry } from "./useManualEntry";
import { ctaStyle, fieldLabelStyle, ghostStyle, inputStyle, sheetTitleStyle } from "./styles";

export default function ManualEntryForm({
  manual,
  onAdd,
  onCancel,
}: {
  manual: ManualEntry;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-3)",
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule-soft)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <p style={sheetTitleStyle}>Enter nutrition manually</p>
      <input
        type="text"
        placeholder="Name (e.g. Greek Yogurt)"
        value={manual.label}
        onChange={(e) => manual.setLabel(e.target.value)}
        style={inputStyle}
      />
      <div className="grid grid-cols-2" style={{ gap: "var(--space-2)" }}>
        {[
          { label: "Calories", value: manual.cal, set: manual.setCal },
          { label: "Protein (g)", value: manual.protein, set: manual.setProtein },
          { label: "Carbs (g)", value: manual.carbs, set: manual.setCarbs },
          { label: "Fat (g)", value: manual.fat, set: manual.setFat },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label style={fieldLabelStyle}>{label}</label>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => set(e.target.value)}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        <button
          onClick={onAdd}
          disabled={!manual.label.trim()}
          className="transition-opacity active:opacity-70 disabled:opacity-40"
          style={{
            ...ctaStyle,
            flex: 1,
            cursor: manual.label.trim() ? "pointer" : "default",
          }}
        >
          Add to session
        </button>
        <button
          onClick={onCancel}
          className="transition-opacity active:opacity-70"
          style={ghostStyle}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
