import type { RecoveryMetrics } from "@/lib/types";

interface Props {
  recovery: RecoveryMetrics | null;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-neutral-500";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function fmtHrs(hrs: number | null): string {
  if (hrs == null) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RecoverySummary({ recovery }: Props) {
  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Recovery &amp; Sleep</p>

      {recovery ? (
        <div className="space-y-3">
          {/* Top scores row */}
          <div className="flex gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Readiness</p>
              <span className={`text-2xl font-semibold font-[family-name:var(--font-mono)] ${scoreColor(recovery.readiness)}`}>
                {recovery.readiness ?? "—"}
              </span>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Sleep</p>
              <span className={`text-2xl font-semibold font-[family-name:var(--font-mono)] ${scoreColor(recovery.sleep_score)}`}>
                {recovery.sleep_score ?? "—"}
              </span>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="flex items-baseline gap-1.5">
              <span className="text-neutral-500 text-xs w-16">HRV</span>
              <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                {recovery.avg_hrv ?? "—"}
                {recovery.avg_hrv != null && <span className="text-xs text-neutral-500 ml-0.5">ms</span>}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-neutral-500 text-xs w-16">RHR</span>
              <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                {recovery.resting_hr ?? "—"}
                {recovery.resting_hr != null && <span className="text-xs text-neutral-500 ml-0.5">bpm</span>}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-neutral-500 text-xs w-16">Total</span>
              <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                {fmtHrs(recovery.total_sleep_hrs)}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-neutral-500 text-xs w-16">Deep</span>
              <span className="font-[family-name:var(--font-mono)] text-neutral-200">
                {fmtHrs(recovery.deep_hrs)}
              </span>
            </div>
          </div>

          <p className="text-xs text-neutral-600">Oura data reflects yesterday · {recovery.date}</p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No recovery data</p>
      )}
    </div>
  );
}
