import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-28" />
      {/* Editor card */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton style={{ height: 300 }} />
      </div>
      {/* Past entries */}
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl p-5 flex items-center justify-between"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
