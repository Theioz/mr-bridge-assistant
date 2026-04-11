import type { RecoveryMetrics } from "@/lib/types";

function statusLabel(r: number): string {
  if (r >= 85) return "Recovery optimal — push hard today";
  if (r >= 70) return "Recovery good — normal training";
  if (r >= 55) return "Recovery moderate — moderate effort";
  if (r >= 40) return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

interface Colors {
  bg: string;
  border: string;
  score: string;
  sub: string;
  accent: string;
  label: string;
}

function colors(r: number | null): Colors {
  if (r == null)
    return {
      bg: "bg-neutral-900",
      border: "border-neutral-800",
      score: "text-neutral-400",
      sub: "text-neutral-500",
      accent: "bg-neutral-700/40",
      label: "text-neutral-500",
    };
  if (r >= 80)
    return {
      bg: "bg-green-950/25",
      border: "border-green-900/50",
      score: "text-green-400",
      sub: "text-green-400/60",
      accent: "bg-green-500/40",
      label: "text-green-400/70",
    };
  if (r >= 60)
    return {
      bg: "bg-amber-950/25",
      border: "border-amber-900/50",
      score: "text-amber-400",
      sub: "text-amber-400/60",
      accent: "bg-amber-500/40",
      label: "text-amber-400/70",
    };
  return {
    bg: "bg-red-950/25",
    border: "border-red-900/50",
    score: "text-red-400",
    sub: "text-red-400/60",
    accent: "bg-red-500/40",
    label: "text-red-400/70",
  };
}

export default function HeroReadiness({ recovery }: { recovery: RecoveryMetrics | null }) {
  const r = recovery?.readiness ?? null;
  const c = colors(r);

  return (
    <div className={`rounded-xl border overflow-hidden ${c.bg} ${c.border}`}>
      <div className={`h-0.5 w-full ${c.accent}`} />
      <div className="px-6 py-4 flex items-center gap-10">
        {/* Primary: readiness */}
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-0.5">Readiness</p>
          <span
            className={`text-[5rem] font-bold font-[family-name:var(--font-mono)] leading-none ${c.score}`}
          >
            {r ?? "—"}
          </span>
        </div>

        {/* Secondary: sleep score */}
        {recovery?.sleep_score != null && (
          <div className="border-l border-neutral-800/60 pl-8">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-0.5">Sleep</p>
            <span
              className={`text-[3rem] font-bold font-[family-name:var(--font-mono)] leading-none ${c.sub}`}
            >
              {recovery.sleep_score}
            </span>
          </div>
        )}

        {/* Status label + date */}
        <div className="ml-auto text-right">
          {r != null ? (
            <>
              <p className={`text-sm font-medium ${c.label}`}>{statusLabel(r)}</p>
              {recovery?.date && (
                <p className="text-xs text-neutral-600 mt-1">Oura · {recovery.date}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-600">No readiness data</p>
          )}
        </div>
      </div>
    </div>
  );
}
