import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  variant?: "empty" | "error";
  paddingY?: number;
}

export default function EmptyState({
  icon: Icon,
  children,
  actionHref,
  actionLabel,
  variant = "empty",
  paddingY = 24,
}: EmptyStateProps) {
  const color = variant === "error" ? "var(--color-danger)" : "var(--color-text-faint)";
  const DisplayIcon = variant === "error" ? AlertTriangle : Icon;
  return (
    <div
      className="flex items-center gap-2"
      style={{ color, fontSize: 14, padding: `${paddingY}px 0` }}
      role={variant === "error" ? "status" : undefined}
    >
      <DisplayIcon size={16} aria-hidden />
      <span>{children}</span>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          style={{ marginLeft: 8, color: "var(--color-primary)", fontWeight: 500 }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
