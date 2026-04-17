import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="flex flex-col"
      style={{ gap: "var(--space-7)" }}
    >
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-3 w-36" style={{ marginTop: "var(--space-2)" }} />
      </div>

      {/* Narrative recap (reading column) */}
      <div className="prose-column flex flex-col" style={{ gap: "var(--space-3)" }}>
        <Skeleton className="h-3 w-24" style={{ marginBottom: "var(--space-2)" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} style={{ height: 14 }} />
        ))}
      </div>

      {/* Metrics sections — hairline tables */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i}>
          <Skeleton className="h-3 w-28" style={{ marginBottom: "var(--space-4)" }} />
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {[1, 2, 3, 4].map((r) => (
              <Skeleton key={r} style={{ height: 20 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
