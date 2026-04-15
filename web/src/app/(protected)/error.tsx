"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Protected route error:", error);
  }, [error]);

  return (
    <div className="max-w-sm mx-auto text-center" style={{ paddingTop: 48 }}>
      <AlertTriangle
        size={32}
        style={{ color: "var(--color-danger)", margin: "0 auto 12px" }}
        aria-hidden
      />
      <h1 className="font-heading font-semibold" style={{ fontSize: 18, marginBottom: 8 }}>
        This page hit a snag
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 20 }}>
        Try again, or head back to the dashboard.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <RotateCcw size={14} />
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text)",
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <LayoutDashboard size={14} />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
