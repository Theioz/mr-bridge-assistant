"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Shared SVG chart primitives for the Impeccable revamp.
 *
 * Design vocabulary (from proposal §5 "Chart system"):
 *   - Primary line: 1.5px stroke in --chart-color-primary.
 *   - Reference lines: 1px hairline in --chart-color-baseline, dashed.
 *   - Today marker: 3px filled dot in --chart-color-today with a 6px halo.
 *   - Stacked bars: same hue at 3 opacity steps (0.85 / 0.45 / 0.18).
 *   - Today's bar gets a hairline --accent outline, never a different fill.
 *   - Axes implicit — endpoint labels only.
 *   - All numeric text is tabular.
 */

// ── Layout constants ──────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 160;
const SERVER_FALLBACK_WIDTH = 600;

// ── Utilities ─────────────────────────────────────────────────────────────

function useChartWidth(): [
  (el: HTMLDivElement | null) => void,
  number,
] {
  const [width, setWidth] = useState<number>(SERVER_FALLBACK_WIDTH);
  const elRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    // After hydration, if we already have a mounted element, sync width.
    const el = elRef.current;
    if (el) {
      setWidth(Math.max(0, el.clientWidth));
    }
  }, []);

  function setRef(el: HTMLDivElement | null) {
    elRef.current = el;
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!el) return;
    setWidth(Math.max(0, el.clientWidth));
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setWidth(Math.max(0, entry.contentRect.width));
        }
      });
      ro.observe(el);
      roRef.current = ro;
    }
  }

  return [setRef, width];
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = () => setReduced(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function niceDomain(values: number[], pad = 0.06): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const base = Math.abs(min) || 1;
    return [min - base * 0.1, max + base * 0.1];
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

// ── Frame ─────────────────────────────────────────────────────────────────

interface ChartFrameProps {
  label: string;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  action?: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartFrame({
  label,
  meta,
  value,
  action,
  note,
  children,
}: ChartFrameProps) {
  return (
    <section
      className="flex flex-col"
      style={{ gap: "var(--space-3)", minWidth: 0 }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "var(--t-micro)",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-text-faint)",
            }}
          >
            {label}
          </h3>
          {meta && (
            <span
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: "var(--t-micro)",
                fontWeight: 400,
                letterSpacing: "0.04em",
                color: "var(--color-text-faint)",
              }}
            >
              {meta}
            </span>
          )}
        </div>
        {value && (
          <span
            className="tnum"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
            {value}
          </span>
        )}
        {action}
      </div>
      {note && (
        <div
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
        >
          {note}
        </div>
      )}
      {children}
    </section>
  );
}

export function EndpointLabels({
  left,
  right,
}: {
  left: string;
  right: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between tnum"
      style={{
        fontSize: 11,
        color: "var(--color-text-faint)",
        letterSpacing: "0.02em",
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function EmptyChart({ height = DEFAULT_HEIGHT }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        height,
        fontSize: "var(--t-micro)",
        color: "var(--color-text-faint)",
        fontStyle: "italic",
      }}
    >
      No data for this period
    </div>
  );
}

// ── Hover hairline + readout ───────────────────────────────────────────────

type HoverState = { index: number; x: number } | null;

function useHoverCursor(pointsX: number[]): {
  hover: HoverState;
  onMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onLeave: () => void;
} {
  const [hover, setHover] = useState<HoverState>(null);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (pointsX.length === 0) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < pointsX.length; i++) {
      const d = Math.abs(pointsX[i] - local.x);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    setHover({ index: bestI, x: pointsX[bestI] });
  }

  function onLeave() {
    setHover(null);
  }

  return { hover, onMove, onLeave };
}

// ── Hover label (shared tooltip pill) ─────────────────────────────────────
//
// Positioned above (preferred) or below the hover anchor, clamped to the
// chart bounds so it never clips. `pointer-events: none` so the underlying
// chart keeps receiving the pointer.

interface HoverLabelProps {
  anchorX: number;
  anchorY: number;
  lines: string[];
  chartWidth: number;
  chartHeight: number;
}

function HoverLabel({
  anchorX,
  anchorY,
  lines,
  chartWidth,
  chartHeight,
}: HoverLabelProps) {
  const fontSize = 11;
  const lineGap = 3;
  const padX = 8;
  const padY = 5;
  const charW = 6.3; // decent estimate for 11px tabular text

  const maxLineLen = Math.max(...lines.map((l) => l.length));
  const w = Math.min(
    Math.max(48, maxLineLen * charW + padX * 2),
    Math.min(240, chartWidth - 4)
  );
  const h = lines.length * fontSize + (lines.length - 1) * lineGap + padY * 2;

  const gap = 10;
  const aboveTop = anchorY - gap - h;
  const belowTop = anchorY + gap;
  const flipBelow = aboveTop < 2 && belowTop + h < chartHeight - 2;
  const rectY = flipBelow ? belowTop : Math.max(2, aboveTop);

  let rectX = anchorX - w / 2;
  if (rectX < 2) rectX = 2;
  if (rectX + w > chartWidth - 2) rectX = chartWidth - 2 - w;

  return (
    <g pointerEvents="none" style={{ transition: "opacity var(--motion-fast) var(--ease-out-quart)" }}>
      <rect
        x={rectX}
        y={rectY}
        width={w}
        height={h}
        rx={3}
        ry={3}
        fill="var(--color-surface-raised)"
        stroke="var(--rule)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={rectX + w / 2}
          y={rectY + padY + fontSize - 1 + i * (fontSize + lineGap)}
          textAnchor="middle"
          style={{
            fontSize,
            fill: i === 0 ? "var(--color-text)" : "var(--color-text-muted)",
            fontWeight: i === 0 ? 500 : 400,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// ── Trend line (primary metric over time) ─────────────────────────────────

interface TrendLineProps {
  values: (number | null)[];
  labels: string[];
  todayIndex?: number;
  refLines?: { y: number; label?: string; dashed?: boolean }[];
  height?: number;
  formatValue: (v: number) => string;
  ariaLabel: string;
  endpointLeft?: string;
  endpointRight?: string;
  onHoverChange?: (info: {
    index: number;
    value: number | null;
    label: string;
  } | null) => void;
  yDomain?: [number, number];
  /** If true, render a soft area fill under the line. */
  fill?: boolean;
}

export function TrendLine({
  values,
  labels,
  todayIndex,
  refLines = [],
  height = DEFAULT_HEIGHT,
  formatValue,
  ariaLabel,
  endpointLeft,
  endpointRight,
  onHoverChange,
  yDomain: forcedDomain,
  fill = false,
}: TrendLineProps) {
  const [setRef, width] = useChartWidth();

  const numeric = values.filter((v): v is number => v != null);
  const [yMin, yMax] = useMemo(() => {
    if (forcedDomain) return forcedDomain;
    const withRefs = [
      ...numeric,
      ...refLines.map((r) => r.y).filter((v): v is number => v != null),
    ];
    return niceDomain(withRefs);
  }, [numeric, refLines, forcedDomain]);

  const padTop = 14;
  const padBottom = 10;
  const padX = 8;
  const innerH = Math.max(1, height - padTop - padBottom);
  const innerW = Math.max(1, width - padX * 2);

  function xAt(i: number): number {
    if (values.length <= 1) return padX + innerW / 2;
    return padX + (innerW * i) / (values.length - 1);
  }
  function yAt(v: number): number {
    const span = yMax - yMin || 1;
    return padTop + innerH - ((v - yMin) / span) * innerH;
  }

  const pointsX = values.map((_, i) => xAt(i));
  const { hover, onMove, onLeave } = useHoverCursor(pointsX);

  useEffect(() => {
    if (!onHoverChange) return;
    if (hover) {
      onHoverChange({
        index: hover.index,
        value: values[hover.index],
        label: labels[hover.index],
      });
    } else {
      onHoverChange(null);
    }
  }, [hover, values, labels, onHoverChange]);

  // Build path — break on nulls so missing data leaves a gap.
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (current) segments.push(current);
      current = "";
    } else {
      const cmd = current ? "L" : "M";
      current += `${cmd}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)} `;
    }
  });
  if (current) segments.push(current);
  const pathD = segments.join("").trim();

  // Fill area beneath the line — only draw one contiguous polygon per segment.
  const areaSegments: string[] = [];
  if (fill) {
    let startI = -1;
    for (let i = 0; i <= values.length; i++) {
      const v = i < values.length ? values[i] : null;
      if (v != null && startI === -1) startI = i;
      if ((v == null || i === values.length) && startI !== -1) {
        const endI = i - 1;
        if (endI > startI) {
          let seg = `M${xAt(startI).toFixed(2)},${(padTop + innerH).toFixed(2)} `;
          for (let j = startI; j <= endI; j++) {
            const vv = values[j] as number;
            seg += `L${xAt(j).toFixed(2)},${yAt(vv).toFixed(2)} `;
          }
          seg += `L${xAt(endI).toFixed(2)},${(padTop + innerH).toFixed(2)} Z`;
          areaSegments.push(seg);
        }
        startI = -1;
      }
    }
  }

  const todayI =
    todayIndex === -1 ? values.length - 1 : todayIndex ?? -1;
  const todayValue =
    todayI >= 0 && todayI < values.length ? values[todayI] : null;

  const hoverValue = hover ? values[hover.index] : null;

  const endLeft = endpointLeft ?? labels[0];
  const endRight = endpointRight ?? (labels.length > 0 ? labels[labels.length - 1] : "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div ref={setRef} style={{ width: "100%", position: "relative" }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${Math.max(1, width)} ${height}`}
          style={{ display: "block", overflow: "visible", fontVariantNumeric: "tabular-nums" }}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          {/* reference lines */}
          {refLines.map((r, i) => {
            const y = yAt(r.y);
            return (
              <g key={i}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-color-baseline)"
                  strokeWidth={1}
                  strokeDasharray={r.dashed === false ? undefined : "3 3"}
                  vectorEffect="non-scaling-stroke"
                />
                {r.label && (
                  <text
                    x={width - padX}
                    y={y - 4}
                    textAnchor="end"
                    style={{
                      fontSize: 10,
                      fill: "var(--color-text-faint)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* area fill */}
          {fill &&
            areaSegments.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="var(--chart-color-primary)"
                fillOpacity={0.08}
              />
            ))}

          {/* primary stroke */}
          {pathD && (
            <path
              d={pathD}
              stroke="var(--chart-color-primary)"
              strokeWidth={1.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* hover hairline + dot + label */}
          {hover && hoverValue != null && (
            <g>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padTop}
                y2={padTop + innerH}
                stroke="var(--chart-color-baseline)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hover.x}
                cy={yAt(hoverValue)}
                r={2.5}
                fill="var(--color-text)"
              />
              <HoverLabel
                anchorX={hover.x}
                anchorY={yAt(hoverValue)}
                lines={[`${labels[hover.index]}  ${formatValue(hoverValue)}`]}
                chartWidth={width}
                chartHeight={height}
              />
            </g>
          )}

          {/* today dot + halo */}
          {todayValue != null && (
            <g>
              <circle
                cx={xAt(todayI)}
                cy={yAt(todayValue)}
                r={6}
                fill="var(--chart-color-today)"
                fillOpacity={0.18}
              />
              <circle
                cx={xAt(todayI)}
                cy={yAt(todayValue)}
                r={3}
                fill="var(--chart-color-today)"
              />
            </g>
          )}

          {/* native tooltips at every data point (no-JS fallback for screen readers) */}
          {values.map((v, i) =>
            v == null ? null : (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(v)}
                r={10}
                fill="transparent"
                pointerEvents="all"
              >
                <title>{`${labels[i]} — ${formatValue(v)}`}</title>
              </circle>
            )
          )}
        </svg>
      </div>
      <EndpointLabels left={endLeft} right={endRight} />
    </div>
  );
}

// ── Stacked bars ──────────────────────────────────────────────────────────

interface StackedBarsProps {
  labels: string[];
  /** Three stack layers ordered bottom→top. Opacity is derived from stack index. */
  stacks: { name: string; values: (number | null)[] }[];
  todayIndex?: number;
  height?: number;
  formatTotal: (v: number) => string;
  ariaLabel: string;
  endpointLeft?: string;
  endpointRight?: string;
  /** Map stack index → fill opacity. Defaults to [0.85, 0.45, 0.18]. */
  opacities?: number[];
  refLines?: { y: number; label?: string; dashed?: boolean }[];
}

export function StackedBars({
  labels,
  stacks,
  todayIndex,
  height = DEFAULT_HEIGHT,
  formatTotal,
  ariaLabel,
  endpointLeft,
  endpointRight,
  opacities = [0.85, 0.45, 0.18],
  refLines = [],
}: StackedBarsProps) {
  const [setRef, width] = useChartWidth();

  const totals = labels.map((_, i) => {
    let sum = 0;
    let any = false;
    for (const s of stacks) {
      const v = s.values[i];
      if (v != null) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  });

  const max = Math.max(
    1,
    ...totals.filter((v): v is number => v != null),
    ...refLines.map((r) => r.y).filter((v): v is number => v != null)
  );
  const padTop = 14;
  const padBottom = 4;
  const padX = 4;
  const innerH = Math.max(1, height - padTop - padBottom);
  const innerW = Math.max(1, width - padX * 2);
  const n = labels.length;
  const gap = n > 1 ? Math.max(2, innerW * 0.08 / n) : 2;
  const barWidth = n > 0 ? Math.max(2, (innerW - gap * (n - 1)) / n) : 0;

  function xAt(i: number): number {
    return padX + i * (barWidth + gap);
  }
  function hFor(v: number): number {
    return (v / max) * innerH;
  }

  const todayI = todayIndex === -1 ? n - 1 : todayIndex ?? -1;
  const barCenters = labels.map((_, i) => xAt(i) + barWidth / 2);
  const { hover, onMove, onLeave } = useHoverCursor(barCenters);
  const hoverTotal = hover ? totals[hover.index] : null;
  const hoverBarTop =
    hoverTotal != null ? padTop + innerH - hFor(hoverTotal) : padTop;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div ref={setRef} style={{ width: "100%" }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${Math.max(1, width)} ${height}`}
          style={{ display: "block", overflow: "visible" }}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          {refLines.map((r, i) => {
            const y = padTop + innerH - (r.y / max) * innerH;
            return (
              <Fragment key={`ref-${i}`}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-color-baseline)"
                  strokeWidth={1}
                  strokeDasharray={r.dashed === false ? undefined : "3 3"}
                  vectorEffect="non-scaling-stroke"
                />
                {r.label && (
                  <text
                    x={width - padX}
                    y={y - 4}
                    textAnchor="end"
                    style={{
                      fontSize: 10,
                      fill: "var(--color-text-faint)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.label}
                  </text>
                )}
              </Fragment>
            );
          })}
          {labels.map((lab, i) => {
            const total = totals[i];
            if (total == null) return null;
            let yCursor = padTop + innerH;
            const segs: React.ReactNode[] = [];
            stacks.forEach((s, si) => {
              const v = s.values[i];
              if (v == null || v <= 0) return;
              const h = hFor(v);
              yCursor -= h;
              const isHovered = hover?.index === i;
              segs.push(
                <rect
                  key={si}
                  x={xAt(i)}
                  y={yCursor}
                  width={barWidth}
                  height={h}
                  fill="var(--chart-color-primary)"
                  fillOpacity={
                    isHovered
                      ? Math.min(1, (opacities[si] ?? 0.4) + 0.15)
                      : opacities[si] ?? 0.4
                  }
                />
              );
            });
            const isToday = i === todayI;
            return (
              <g key={i}>
                {segs}
                {isToday && (
                  <rect
                    x={xAt(i) - 0.75}
                    y={padTop + innerH - hFor(total) - 0.75}
                    width={barWidth + 1.5}
                    height={hFor(total) + 1.5}
                    fill="none"
                    stroke="var(--chart-color-today)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <rect
                  x={xAt(i)}
                  y={padTop}
                  width={barWidth}
                  height={innerH}
                  fill="transparent"
                  pointerEvents="all"
                >
                  <title>
                    {`${lab} — ${formatTotal(total)}${stacks
                      .map((s) =>
                        s.values[i] != null
                          ? ` · ${s.name} ${s.values[i]!.toFixed(1)}`
                          : ""
                      )
                      .join("")}`}
                  </title>
                </rect>
              </g>
            );
          })}

          {hover && hoverTotal != null && (
            <HoverLabel
              anchorX={barCenters[hover.index]}
              anchorY={hoverBarTop}
              lines={[
                `${labels[hover.index]}  ${formatTotal(hoverTotal)}`,
                stacks
                  .map((s) =>
                    s.values[hover.index] != null
                      ? `${s.name} ${s.values[hover.index]!.toFixed(1)}`
                      : null
                  )
                  .filter((v): v is string => !!v)
                  .join(" · "),
              ].filter((s) => s.length > 0)}
              chartWidth={width}
              chartHeight={height}
            />
          )}
        </svg>
      </div>
      <EndpointLabels
        left={endpointLeft ?? labels[0] ?? ""}
        right={endpointRight ?? (labels.length > 0 ? labels[labels.length - 1] : "")}
      />
    </div>
  );
}

// ── Simple bars (workout frequency, sleep total, etc.) ────────────────────

interface BarSeriesProps {
  labels: string[];
  values: (number | null)[];
  todayIndex?: number;
  height?: number;
  formatValue: (v: number) => string;
  ariaLabel: string;
  endpointLeft?: string;
  endpointRight?: string;
  refLines?: { y: number; label?: string; dashed?: boolean }[];
  /** Per-bar opacity (0–1). Defaults to 0.6 filled. */
  opacity?: (index: number, value: number | null) => number;
  yDomain?: [number, number];
}

export function BarSeries({
  labels,
  values,
  todayIndex,
  height = DEFAULT_HEIGHT,
  formatValue,
  ariaLabel,
  endpointLeft,
  endpointRight,
  refLines = [],
  opacity,
  yDomain,
}: BarSeriesProps) {
  const [setRef, width] = useChartWidth();

  const numeric = values.filter((v): v is number => v != null && v > 0);
  const [yMin, yMax] = useMemo(() => {
    if (yDomain) return yDomain;
    if (numeric.length === 0) return [0, 1];
    const withRef = [
      ...numeric,
      ...refLines.map((r) => r.y).filter((v): v is number => v != null),
    ];
    const max = Math.max(...withRef);
    return [0, max * 1.1];
  }, [numeric, refLines, yDomain]);

  const padTop = 14;
  const padBottom = 4;
  const padX = 4;
  const innerH = Math.max(1, height - padTop - padBottom);
  const innerW = Math.max(1, width - padX * 2);
  const n = labels.length;
  const gap = n > 1 ? Math.max(1.5, innerW * 0.08 / n) : 1.5;
  const barWidth = n > 0 ? Math.max(2, (innerW - gap * (n - 1)) / n) : 0;

  function xAt(i: number): number {
    return padX + i * (barWidth + gap);
  }
  function hFor(v: number): number {
    const span = yMax - yMin || 1;
    return ((v - yMin) / span) * innerH;
  }

  const todayI = todayIndex === -1 ? n - 1 : todayIndex ?? -1;

  const barCenters = labels.map((_, i) => xAt(i) + barWidth / 2);
  const { hover, onMove, onLeave } = useHoverCursor(barCenters);
  const hoverV = hover ? values[hover.index] : null;
  const hoverBarH = hoverV != null ? Math.max(0, hFor(hoverV)) : 0;
  const hoverBarTop = hoverV != null ? padTop + innerH - hoverBarH : padTop;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div ref={setRef} style={{ width: "100%" }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${Math.max(1, width)} ${height}`}
          style={{ display: "block", overflow: "visible" }}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          {refLines.map((r, i) => {
            const y = padTop + innerH - hFor(r.y);
            return (
              <Fragment key={i}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-color-baseline)"
                  strokeWidth={1}
                  strokeDasharray={r.dashed === false ? undefined : "3 3"}
                  vectorEffect="non-scaling-stroke"
                />
                {r.label && (
                  <text
                    x={width - padX}
                    y={y - 4}
                    textAnchor="end"
                    style={{
                      fontSize: 10,
                      fill: "var(--color-text-faint)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.label}
                  </text>
                )}
              </Fragment>
            );
          })}

          {labels.map((lab, i) => {
            const v = values[i];
            if (v == null) return null;
            const op = opacity ? opacity(i, v) : 0.6;
            const isToday = i === todayI;
            const isHovered = hover?.index === i;
            const h = Math.max(0, hFor(v));
            const y = padTop + innerH - h;
            return (
              <g key={i}>
                {h > 0 && (
                  <rect
                    x={xAt(i)}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill="var(--chart-color-primary)"
                    fillOpacity={isHovered ? Math.min(1, op + 0.15) : op}
                  />
                )}
                {isToday && h > 0 && (
                  <rect
                    x={xAt(i) - 0.75}
                    y={y - 0.75}
                    width={barWidth + 1.5}
                    height={h + 1.5}
                    fill="none"
                    stroke="var(--chart-color-today)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <rect
                  x={xAt(i)}
                  y={padTop}
                  width={barWidth}
                  height={innerH}
                  fill="transparent"
                  pointerEvents="all"
                >
                  <title>{`${lab} — ${formatValue(v)}`}</title>
                </rect>
              </g>
            );
          })}

          {hover && hoverV != null && (
            <HoverLabel
              anchorX={barCenters[hover.index]}
              anchorY={hoverBarTop}
              lines={[`${labels[hover.index]}  ${formatValue(hoverV)}`]}
              chartWidth={width}
              chartHeight={height}
            />
          )}
        </svg>
      </div>
      <EndpointLabels
        left={endpointLeft ?? labels[0] ?? ""}
        right={endpointRight ?? (labels.length > 0 ? labels[labels.length - 1] : "")}
      />
    </div>
  );
}

// Re-export the useful small bits for external call sites.
export { useReducedMotion };
