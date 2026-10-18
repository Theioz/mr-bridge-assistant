import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import type { FailedPhoto, PendingPhoto } from "./types";

// In-flight analysis — per-photo loading row.
export function PendingPhotoRow({ photo, divider }: { photo: PendingPhoto; divider: boolean }) {
  return (
    <div
      style={{
        borderTop: divider ? "1px solid var(--rule-soft)" : "none",
        padding: "var(--space-3) 0",
      }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <Loader2
          size={13}
          className="animate-spin"
          style={{ color: "var(--accent)", flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-muted)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Analyzing {photo.fileName}…
        </span>
      </div>
    </div>
  );
}

// Failed analysis — error row with retry.
export function FailedPhotoRow({
  photo,
  divider,
  onRetry,
  onDismiss,
}: {
  photo: FailedPhoto;
  divider: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        borderTop: divider ? "1px solid var(--rule-soft)" : "none",
        padding: "var(--space-3) 0",
      }}
    >
      <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
        <AlertCircle
          size={13}
          style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: 2 }}
        />
        <span
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--color-danger)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {photo.errorMsg}
        </span>
        <button
          onClick={onRetry}
          className="flex items-center transition-opacity active:opacity-70 flex-shrink-0"
          style={{
            gap: "var(--space-1)",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
            background: "none",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-2)",
            cursor: "pointer",
            padding: "var(--space-1) var(--space-2)",
          }}
        >
          <RefreshCw size={11} />
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="transition-opacity active:opacity-70 flex-shrink-0 flex items-center justify-center"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            width: 28,
            height: 28,
          }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
