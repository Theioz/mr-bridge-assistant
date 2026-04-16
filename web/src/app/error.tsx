"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <div className="max-w-sm text-center">
        <AlertTriangle
          size={36}
          style={{ color: "var(--color-danger)", margin: "0 auto 16px" }}
          aria-hidden
        />
        <h1 className="font-heading font-semibold" style={{ fontSize: 20, marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 20 }}>
          An unexpected error interrupted this page. You can try again — if it keeps
          happening, reload or sign out and back in.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-text-on-cta)",
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
      </div>
    </div>
  );
}
