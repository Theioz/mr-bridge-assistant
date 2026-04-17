import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col max-w-2xl" style={{ gap: "var(--space-6)" }}>
      <Skeleton className="h-8 w-28" />
      {/* Tab bar placeholder */}
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        {[72, 88, 64, 80].map((w, i) => (
          <Skeleton key={i} className="h-9" style={{ width: w }} />
        ))}
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
