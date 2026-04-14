import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-28" />
      <div
        className="rounded-xl p-5 space-y-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-48 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
