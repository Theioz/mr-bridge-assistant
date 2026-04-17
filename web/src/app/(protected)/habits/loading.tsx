import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      <Skeleton className="h-8 w-28" />
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: "var(--space-7)" }}>
        {/* Heatmap placeholder (spans 2/3) */}
        <div className="lg:col-span-2">
          <Skeleton className="h-3 w-32" style={{ marginBottom: "var(--space-4)" }} />
          <Skeleton style={{ height: 170 }} />
        </div>
        {/* Radial placeholder */}
        <div className="flex flex-col items-center" style={{ gap: "var(--space-4)" }}>
          <Skeleton className="h-3 w-32" style={{ alignSelf: "flex-start" }} />
          <Skeleton className="rounded-full" style={{ width: 140, height: 140 }} />
        </div>
      </div>
      {/* Habit rows */}
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <Skeleton className="h-3 w-24" style={{ marginBottom: "var(--space-2)" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center" style={{ gap: "var(--space-3)" }}>
            <Skeleton className="rounded-full" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
