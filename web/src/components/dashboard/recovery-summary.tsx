import type { RecoveryMetrics } from "@/lib/types";
import RecoveryTrends from "./recovery-trends";
import InlineSparkline from "./inline-sparkline";

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

function statusLabel(recovery: RecoveryMetrics): string {
  const r = recovery.readiness;
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

function fmtHrs(hrs: number | null): string {
  if (hrs == null) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RecoverySummary({ recovery, trends }: Props) {
  const trendHrv = trends?.map((d) => d.avg_hrv) ?? [];

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden h-full">
      {/* Color accent bar at top */}
      <div className={`h-0.5 w-full ${accentBar(recovery?.readiness ?? null)}`} />

      <div className="p-5">
        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-4">Recovery &amp; Sleep</p>

        {recovery ? (
          <div className="space-y-4">
            {/* Big scores */}
            <div className={`flex items-end gap-8 rounded-xl p-4 ${scoreBg(recovery.readiness)}`}>
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
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {/* HRV with inline sparkline */}
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 text-xs w-12 shrink-0">HRV</span>
                <span className="font-[family-name:var(--font-mono)] text-neutral-200 shrink-0">
                  {recovery.avg_hrv ?? "—"}
                  {recovery.avg_hrv != null && <span className="text-xs text-neutral-500 ml-0.5">ms</span>}
                </span>
                {trendHrv.length > 2 && (
                  <div className="flex-1 min-w-0">
                    <InlineSparkline data={trendHrv} color="#3b82f6" height={20} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-neutral-500 text-xs w-12 shrink-0">RHR</span>
                <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                  {recovery.resting_hr ?? "—"}
                  {recovery.resting_hr != null && <span className="text-xs text-neutral-500 ml-0.5">bpm</span>}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-neutral-500 text-xs w-12 shrink-0">Total</span>
                <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                  {fmtHrs(recovery.total_sleep_hrs)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-neutral-500 text-xs w-12 shrink-0">Deep</span>
                <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                  {fmtHrs(recovery.deep_hrs)}
                </span>
              </div>
            </div>

            {/* Status banner */}
            <div className={`text-xs px-3 py-2 rounded-lg border ${statusColor(recovery.readiness)}`}>
              {statusLabel(recovery)}
            </div>

            <p className="text-xs text-neutral-600">Oura · {recovery.date}</p>

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
