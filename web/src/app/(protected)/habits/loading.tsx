import { Skeleton, SkeletonChart } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-28" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radial completion circle */}
        <div
          className="rounded-xl p-5 flex flex-col items-center gap-4"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="rounded-full" style={{ width: 120, height: 120 }} />
        </div>
        <SkeletonChart height={120} />
      </div>
      {/* Habit rows */}
      <div
        className="rounded-xl p-5 space-y-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <Skeleton className="h-4 w-24 mb-4" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="rounded-full" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
