import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      <Skeleton className="h-8 w-56" />
      <SkeletonChart height={220} />
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--space-7)" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--space-7)" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
