import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div
        className="rounded-xl divide-y"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderColor: "var(--color-border)",
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton
              className="rounded-full mt-0.5"
              style={{ width: 8, height: 8, flexShrink: 0 }}
            />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
