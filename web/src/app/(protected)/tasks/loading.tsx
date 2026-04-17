import { Skeleton } from "@/components/ui/skeleton";

function PriorityGroup() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <Skeleton className="h-3 w-16" style={{ marginBottom: "var(--space-2)" }} />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <Skeleton className="rounded-full" style={{ width: 18, height: 18, flexShrink: 0 }} />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col max-w-2xl" style={{ gap: "var(--space-7)" }}>
      <Skeleton className="h-8 w-24" />
      {/* Add-task form placeholder — flat, hairline */}
      <Skeleton className="h-9 w-full" />
      <PriorityGroup />
      <PriorityGroup />
      <PriorityGroup />
    </div>
  );
}
