"use client";

// A dropdown of 15-minute time slots. Native <input type="time" step="900"> only enforces the
// step in its spinner/validation — the wheel picker (and most mobile keyboards) still let you pick
// any minute. A <select> guarantees quarter-hour steps identically on phone and desktop.

const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const h12 = ((h + 11) % 12) + 1;
    const ap = h < 12 ? "AM" : "PM";
    out.push({ value, label: `${h12}:${String(min).padStart(2, "0")} ${ap}` });
  }
  return out;
})();

export default function TimeSelect({
  value,
  onChange,
  ariaLabel,
  placeholder = "—:—",
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus:outline-none flex-shrink-0"
      style={{
        fontSize: "var(--t-micro)",
        background: "transparent",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
        padding: "4px 6px",
        color: value ? "var(--color-text)" : "var(--color-text-faint)",
      }}
    >
      <option value="">{placeholder}</option>
      {TIME_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
