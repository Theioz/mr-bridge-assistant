import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Message area */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading conversation…
        </span>
      </div>
      {/* Input bar */}
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
