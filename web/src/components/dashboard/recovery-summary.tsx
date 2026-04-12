import type { RecoveryMetrics } from "@/lib/types";
import RecoveryTrends from "./recovery-trends";
import InlineSparkline from "./inline-sparkline";
import SyncButton from "./sync-button";

interface Props {
  recovery: RecoveryMetrics | null;
  trends?: RecoveryMetrics[];
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-neutral-500";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number | null): string {
  if (score == null) return "bg-neutral-800/30";
  if (score >= 80) return "bg-green-950/30";
  if (score >= 60) return "bg-amber-950/30";
  return "bg-red-950/30";
}

function accentBar(score: number | null): string {
  if (score == null) return "bg-neutral-700/50";
  if (score >= 80) return "bg-green-500/50";
  if (score >= 60) return "bg-amber-500/50";
  return "bg-red-500/50";
}

function statusLabel(r: number | null): string {
  if (r == null) return "Readiness unknown";
  if (r >= 85) return "Recovery optimal — push hard today";
  if (r >= 70) return "Recovery good — normal training";
  if (r >= 55) return "Recovery moderate — moderate effort";
  if (r >= 40) return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

function statusColor(score: number | null): string {
  if (score == null) return "text-neutral-500 border-neutral-800 bg-neutral-900";
  if (score >= 70) return "text-green-400/80 border-green-900 bg-green-950/20";
  if (score >= 55) return "text-amber-400/80 border-amber-900 bg-amber-950/20";
  return "text-red-400/80 border-red-900 bg-red-950/20";
}

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

// Safely read a value from the metadata jsonb blob
function meta(recovery: RecoveryMetrics, key: string): number | string | null {
  const val = recovery.metadata?.[key];
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "string") return val;
  return null;
}

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  children?: React.ReactNode;
}

function Metric({ label, value, unit, children }: MetricProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-neutral-500 text-xs w-[4.5rem] shrink-0">{label}</span>
      <span className="font-[family-name:var(--font-mono)] text-neutral-200 shrink-0 text-sm">
        {value}
        {unit && value !== "—" && (
          <span className="text-xs text-neutral-500 ml-0.5">{unit}</span>
        )}
      </span>
      {children}
    </div>
  );
}

export default function RecoverySummary({ recovery, trends }: Props) {
  const trendHrv = trends?.map((d) => d.avg_hrv) ?? [];

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden h-full">
      <div className={`h-0.5 w-full ${accentBar(recovery?.readiness ?? null)}`} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Recovery &amp; Sleep</p>
          <SyncButton />
        </div>

        {recovery ? (
          <div className="space-y-4">
            {/* Three scores */}
            <div className={`flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl p-4 ${scoreBg(recovery.readiness)}`}>
              <div>
                <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Readiness</p>
                <span className={`text-[3.25rem] font-bold font-[family-name:var(--font-mono)] leading-none ${scoreColor(recovery.readiness)}`}>
                  {recovery.readiness ?? "—"}
                </span>
              </div>
              <div className="pb-1">
                <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Sleep</p>
                <span className={`text-[2.5rem] font-bold font-[family-name:var(--font-mono)] leading-none ${scoreColor(recovery.sleep_score)}`}>
                  {recovery.sleep_score ?? "—"}
                </span>
              </div>
              {recovery.activity_score != null && (
                <div className="pb-1">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Activity</p>
                  <span className={`text-[2.5rem] font-bold font-[family-name:var(--font-mono)] leading-none ${scoreColor(recovery.activity_score)}`}>
                    {recovery.activity_score}
                  </span>
                </div>
              )}
              <div className="w-full sm:w-auto sm:ml-auto text-left sm:text-right pb-1">
                <p className={`text-xs font-medium ${statusColor(recovery.readiness).split(" ")[0]}`}>
                  {statusLabel(recovery.readiness)}
                </p>
                <p className="text-xs text-neutral-600 mt-1">Oura · {recovery.date}</p>
              </div>
            </div>

            {/* Metrics grid — 3 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {/* Row 1: HRV, RHR, SpO2 */}
              <Metric label="HRV" value={fmtNum(recovery.avg_hrv)} unit="ms">
                {trendHrv.length > 2 && (
                  <div className="flex-1 min-w-0">
                    <InlineSparkline data={trendHrv} color="#3b82f6" height={20} />
                  </div>
                )}
              </Metric>
              <Metric label="RHR" value={fmtNum(recovery.resting_hr)} unit="bpm" />
              <Metric
                label="SpO2"
                value={recovery.spo2_avg != null && recovery.spo2_avg > 0 ? fmtNum(recovery.spo2_avg, 1) : "—"}
                unit="%"
              />

              {/* Row 2: Steps, Active Cal, Body Temp */}
              <Metric label="Steps" value={recovery.steps != null ? recovery.steps.toLocaleString() : "—"} />
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

              {/* Row 3: Sleep stages */}
              <Metric label="Total Sleep" value={fmtHrs(recovery.total_sleep_hrs)} />
              <Metric label="Deep" value={fmtHrs(recovery.deep_hrs)} />
              <Metric label="REM" value={fmtHrs(recovery.rem_hrs)} />

              {/* Row 4: Sleep detail + daytime HR (from metadata) */}
              <Metric
                label="Efficiency"
                value={meta(recovery, "sleep_efficiency") != null ? `${meta(recovery, "sleep_efficiency")}` : "—"}
                unit={meta(recovery, "sleep_efficiency") != null ? "%" : undefined}
              />
              <Metric
                label="Latency"
                value={meta(recovery, "latency_mins") != null ? `${meta(recovery, "latency_mins")}` : "—"}
                unit={meta(recovery, "latency_mins") != null ? "min" : undefined}
              />
              {meta(recovery, "hr_avg_day") != null ? (
                <Metric
                  label="Daytime HR"
                  value={`${meta(recovery, "hr_avg_day")} (${meta(recovery, "hr_min_day")}–${meta(recovery, "hr_max_day")})`}
                  unit="bpm"
                />
              ) : (
                <Metric label="Light Sleep" value={fmtHrs(recovery.light_hrs)} />
              )}
            </div>

            {/* Stress row — only if data present */}
            {(meta(recovery, "stress_high_mins") != null || meta(recovery, "stress_day_summary") != null) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 pt-1 border-t border-neutral-800/60">
                <span className="uppercase tracking-wide">Stress</span>
                {meta(recovery, "stress_high_mins") != null && (
                  <span className="font-[family-name:var(--font-mono)] text-neutral-300">
                    {meta(recovery, "stress_high_mins")}m high
                    {meta(recovery, "stress_recovery_mins") != null && (
                      <span> · {meta(recovery, "stress_recovery_mins")}m recovery</span>
                    )}
                  </span>
                )}
                {meta(recovery, "stress_day_summary") != null && (
                  <span className="text-neutral-500 capitalize">{String(meta(recovery, "stress_day_summary")).replace(/_/g, " ")}</span>
                )}
                {meta(recovery, "resilience_level") != null && (
                  <span className="ml-auto text-neutral-500 capitalize">
                    Resilience: {String(meta(recovery, "resilience_level")).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}

            {/* Status banner */}
            <div className={`text-xs px-3 py-2 rounded-lg border ${statusColor(recovery.readiness)}`}>
              {statusLabel(recovery.readiness)}
            </div>

            {trends && trends.length > 0 && (
              <>
                <div className="border-t border-neutral-800" />
                <RecoveryTrends data={trends} />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No recovery data</p>
        )}
      </div>
    </div>
  );
}
