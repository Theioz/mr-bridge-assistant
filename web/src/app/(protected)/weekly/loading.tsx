import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-2)",
        padding: "var(--space-5)",
      }}
    >
      <Skeleton className="h-3 w-28" style={{ marginBottom: "var(--space-4)" }} />
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        {[1, 2, 3, 4].map((r) => (
          <Skeleton key={r} style={{ height: 20 }} />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-3 w-36" style={{ marginTop: "var(--space-2)" }} />
      </div>

      {/* Three rows of two cards */}
      {[1, 2, 3].map((row) => (
        <div
          key={row}
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: "var(--space-6)" }}
        >
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}
