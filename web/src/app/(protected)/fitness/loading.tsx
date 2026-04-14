import { Skeleton, SkeletonChart } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      {/* Window selector strip */}
      <div className="flex gap-2">
        {[80, 64, 80, 96].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart height={180} />
        <SkeletonChart height={180} />
        <SkeletonChart height={180} />
        <SkeletonChart height={180} />
      </div>
    </div>
  );
}
