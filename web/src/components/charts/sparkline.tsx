type SparklineProps = {
  values: number[];
  ariaLabel: string;
  className?: string;
  width?: number;
  height?: number;
};

export function Sparkline({
  values,
  ariaLabel,
  className,
  width = 80,
  height = 32,
}: SparklineProps) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const last = points[points.length - 1];
  const [lastX, lastY] = last.split(",").map(Number);

  return (
    <svg
      className={`mini-chart ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--chart-color-primary)"
        strokeWidth="var(--chart-stroke)"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={4.5}
        fill="none"
        stroke="var(--chart-color-today)"
        strokeWidth={1}
        opacity={0.35}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="var(--chart-color-today)" />
    </svg>
  );
}
