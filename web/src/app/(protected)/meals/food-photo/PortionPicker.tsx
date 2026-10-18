// Portion slider — rendered inline in each item row (#554).
export default function PortionPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label="Portion size"
        style={{
          flex: 1,
          accentColor: "var(--accent)",
          cursor: "pointer",
        }}
      />
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          minWidth: 32,
          textAlign: "right" as const,
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
