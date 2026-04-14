import { Skeleton } from "@/components/ui/skeleton";

function PriorityGroup() {
  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <Skeleton className="h-4 w-16 mb-3" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="rounded" style={{ width: 16, height: 16, flexShrink: 0 }} />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-24" />
      {/* Add-task form */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <Skeleton className="h-9 w-full" />
      </div>
      <PriorityGroup />
      <PriorityGroup />
      <PriorityGroup />
    </div>
  );
}
