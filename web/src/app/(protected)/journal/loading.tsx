import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="prose-column"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}
    >
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-44" style={{ marginTop: "var(--space-2)" }} />
      </div>

      {/* Tab bar hairline */}
      <div
        style={{
          borderBottom: "1px solid var(--rule-soft)",
          paddingBottom: "var(--space-3)",
          display: "flex",
          gap: "var(--space-5)",
        }}
      >
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Prompt fields — flat, hairline-separated */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            paddingTop: i > 1 ? "var(--space-5)" : 0,
            borderTop: i > 1 ? "1px solid var(--rule-soft)" : "none",
          }}
        >
          <Skeleton className="h-3 w-28" style={{ marginBottom: "var(--space-3)" }} />
          <Skeleton style={{ height: 72 }} />
        </div>
      ))}
    </div>
  );
}
