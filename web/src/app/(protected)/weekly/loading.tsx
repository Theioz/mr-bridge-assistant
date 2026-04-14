import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-44" />
      <div className="grid grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart height={200} />
      <SkeletonCard />
    </div>
  );
}
