import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton() {
  return (
    <div className="flex flex-col">
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
  const rowStyle = {
    gap: "var(--space-7)",
    paddingBottom: "var(--space-7)",
    borderBottom: "1px solid var(--rule-soft)",
  } as const;
  const rowStyleLast = { gap: "var(--space-7)" } as const;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-3 w-36" style={{ marginTop: "var(--space-2)" }} />
      </div>

      {/* Three rows of two flat panels, hairline-separated */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyleLast}>
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  );
}
