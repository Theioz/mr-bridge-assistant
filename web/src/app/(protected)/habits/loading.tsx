import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      {/* Header */}
      <div className="flex items-start justify-between" style={{ gap: "var(--space-4)" }}>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-40" />
      </div>

      {/* Today's habits */}
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <Skeleton className="h-3 w-20" style={{ marginBottom: "var(--space-2)" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center" style={{ gap: "var(--space-3)" }}>
            <Skeleton className="rounded-full" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>

      {/* Radial (1/3) + Momentum (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: "var(--space-7)" }}>
        <div className="flex flex-col items-center" style={{ gap: "var(--space-4)" }}>
          <Skeleton className="h-3 w-32" style={{ alignSelf: "flex-start" }} />
          <Skeleton className="rounded-full" style={{ width: 140, height: 140 }} />
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-3 w-32" style={{ marginBottom: "var(--space-4)" }} />
          <Skeleton style={{ height: 160 }} />
          <div className="flex justify-between" style={{ marginTop: "var(--space-2)" }}>
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>

      {/* Streak rows */}
      <div className="flex flex-col">
        <Skeleton className="h-3 w-24" style={{ marginBottom: "var(--space-4)" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between"
            style={{
              minHeight: 44,
              padding: "var(--space-3) 0",
              borderTop: i > 1 ? "1px solid var(--rule-soft)" : undefined,
            }}
          >
            <Skeleton className="h-4" style={{ width: "45%" }} />
            <Skeleton className="h-4" style={{ width: 96 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
