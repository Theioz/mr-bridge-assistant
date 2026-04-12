import type { RecoveryMetrics } from "@/lib/types";
import RecoveryTrends from "./recovery-trends";
import InlineSparkline from "./inline-sparkline";

interface Props {
  recovery: RecoveryMetrics | null;
  trends?: RecoveryMetrics[];
}

// ── Score helpers ───────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function scorePanelStyle(score: number | null): React.CSSProperties {
  if (score == null)
    return { background: "var(--color-surface-raised)", borderRadius: 12, padding: "16px 20px" };
  const base =
    score >= 80 ? "16,185,129" :
    score >= 60 ? "245,158,11" :
                  "239,68,68";
  return {
    background: `rgba(${base},0.10)`,
    border: `1px solid rgba(${base},0.22)`,
    borderRadius: 12,
    padding: "16px 20px",
  };
}

function accentColor(score: number | null): string {
  if (score == null) return "var(--color-border)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function statusText(score: number | null): string {
  if (score == null) return "No readiness data";
  if (score >= 85)   return "Recovery optimal — push hard today";
  if (score >= 70)   return "Recovery good — normal training";
  if (score >= 55)   return "Recovery moderate — moderate effort";
  if (score >= 40)   return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtHrs(hrs: number | null | undefined): string {
  if (hrs == null) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function metaVal(recovery: RecoveryMetrics, key: string): number | string | null {
  const val = recovery.metadata?.[key];
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "string") return val;
  return null;
}

// ── Metric row ──────────────────────────────────────────────────────────────

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  children?: React.ReactNode;
}

function Metric({ label, value, unit, children }: MetricProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="text-xs shrink-0 tabular-nums"
        style={{ color: "var(--color-text-muted)", width: "4.5rem" }}
      >
        {label}
      </span>
      <span
        className="text-sm shrink-0 tabular-nums"
        style={{ color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
        {unit && value !== "—" && (
          <span className="text-xs ml-0.5" style={{ color: "var(--color-text-muted)" }}>
            {unit}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RecoverySummary({ recovery, trends }: Props) {
  const trendHrv = trends?.map((d) => d.avg_hrv) ?? [];
  const accentBg = accentColor(recovery?.readiness ?? null);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Colored top bar */}
      <div style={{ height: 3, background: accentBg, flexShrink: 0 }} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
          >
            Recovery &amp; Sleep
          </p>
        </div>

        {recovery ? (
          <>
            {/* Score panel */}
            <div style={scorePanelStyle(recovery.readiness)}>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                {/* Readiness */}
                <div>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Readiness
                  </p>
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 52, color: scoreColor(recovery.readiness) }}
                  >
                    {recovery.readiness ?? "—"}
                  </span>
                </div>

                {/* Sleep */}
                <div className="pb-1">
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Sleep
                  </p>
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 40, color: scoreColor(recovery.sleep_score) }}
                  >
                    {recovery.sleep_score ?? "—"}
                  </span>
                </div>

                {/* Activity score (if available) */}
                {recovery.activity_score != null && (
                  <div className="pb-1">
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                      Activity
                    </p>
                    <span
                      className="font-heading font-bold leading-none"
                      style={{ fontSize: 40, color: scoreColor(recovery.activity_score) }}
                    >
                      {recovery.activity_score}
                    </span>
                  </div>
                )}

                {/* Status + source */}
                <div className="ml-auto text-right pb-1">
                  <p
                    className="text-xs font-medium"
                    style={{ color: scoreColor(recovery.readiness) }}
                  >
                    {statusText(recovery.readiness)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-faint)" }}>
                    {recovery.source ?? "Oura"} · {recovery.date}
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {/* HRV with sparkline */}
              <Metric label="HRV" value={fmtNum(recovery.avg_hrv)} unit="ms">
                {trendHrv.length > 2 && (
                  <div className="flex-1 min-w-0">
                    <InlineSparkline data={trendHrv} color="var(--color-positive)" height={20} />
                  </div>
                )}
              </Metric>
              <Metric label="RHR"  value={fmtNum(recovery.resting_hr)} unit="bpm" />
              <Metric
                label="SpO2"
                value={recovery.spo2_avg != null && recovery.spo2_avg > 0 ? fmtNum(recovery.spo2_avg, 1) : "—"}
                unit="%"
              />

              <Metric label="Steps"      value={recovery.steps != null ? recovery.steps.toLocaleString() : "—"} />
              <Metric label="Active Cal" value={fmtNum(recovery.active_cal)} unit="kcal" />
              <Metric
                label="Temp Δ"
                value={
                  recovery.body_temp_delta != null
                    ? `${recovery.body_temp_delta > 0 ? "+" : ""}${(recovery.body_temp_delta * 9 / 5).toFixed(2)}`
                    : "—"
                }
                unit={recovery.body_temp_delta != null ? "°F" : undefined}
              />

              <Metric label="Total Sleep" value={fmtHrs(recovery.total_sleep_hrs)} />
              <Metric label="Deep"        value={fmtHrs(recovery.deep_hrs)} />
              <Metric label="REM"         value={fmtHrs(recovery.rem_hrs)} />

              <Metric
                label="Efficiency"
                value={metaVal(recovery, "sleep_efficiency") != null ? String(metaVal(recovery, "sleep_efficiency")) : "—"}
                unit={metaVal(recovery, "sleep_efficiency") != null ? "%" : undefined}
              />
              <Metric
                label="Latency"
                value={metaVal(recovery, "latency_mins") != null ? String(metaVal(recovery, "latency_mins")) : "—"}
                unit={metaVal(recovery, "latency_mins") != null ? "min" : undefined}
              />
              <Metric label="Light Sleep" value={fmtHrs(recovery.light_hrs)} />
            </div>

            {/* Stress row */}
            {(metaVal(recovery, "stress_high_mins") != null || metaVal(recovery, "stress_day_summary") != null) && (
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs"
                style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
              >
                <span className="uppercase tracking-widest" style={{ letterSpacing: "0.07em" }}>Stress</span>
                {metaVal(recovery, "stress_high_mins") != null && (
                  <span className="tabular-nums" style={{ color: "var(--color-text)" }}>
                    {metaVal(recovery, "stress_high_mins")}m high
                    {metaVal(recovery, "stress_recovery_mins") != null && (
                      <> · {metaVal(recovery, "stress_recovery_mins")}m recovery</>
                    )}
                  </span>
                )}
                {metaVal(recovery, "stress_day_summary") != null && (
                  <span className="capitalize" style={{ color: "var(--color-text-muted)" }}>
                    {String(metaVal(recovery, "stress_day_summary")).replace(/_/g, " ")}
                  </span>
                )}
                {metaVal(recovery, "resilience_level") != null && (
                  <span className="ml-auto capitalize" style={{ color: "var(--color-text-muted)" }}>
                    Resilience: {String(metaVal(recovery, "resilience_level")).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}

            {/* Sleep trend chart */}
            {trends && trends.length > 0 && (
              <>
                <div style={{ borderTop: "1px solid var(--color-border)" }} />
                <RecoveryTrends data={trends} />
              </>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-center py-10 rounded-xl"
            style={{ background: "var(--color-surface-raised)" }}
          >
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>
              No recovery data — run a sync to pull latest from Oura
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
