interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={className}>
      <Skeleton className="h-3 w-24" style={{ marginBottom: "var(--space-4)" }} />
      <Skeleton className="h-6 w-16" style={{ marginBottom: "var(--space-2)" }} />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonChart({
  height = 200,
  className = "",
}: SkeletonProps & { height?: number }) {
  return (
    <div className={className}>
      <Skeleton className="h-3 w-32" style={{ marginBottom: "var(--space-4)" }} />
      <Skeleton style={{ height }} />
    </div>
  );
}
