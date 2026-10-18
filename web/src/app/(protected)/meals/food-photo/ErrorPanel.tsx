import { AlertCircle, Camera, ImageIcon } from "lucide-react";
import { ctaStyle, ghostStyle } from "./styles";

const smallButton = {
  fontSize: "var(--t-micro)",
  padding: "var(--space-2) var(--space-3)",
} as const;

// Error / recovery panel shown while scanPhase === "error".
export default function ErrorPanel({
  message,
  onCamera,
  onLibrary,
  onManual,
}: {
  message: string;
  onCamera: () => void;
  onLibrary: () => void;
  onManual: () => void;
}) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        borderRadius: "var(--r-2)",
        border: "1px solid var(--color-danger-subtle)",
        background: "transparent",
      }}
    >
      <div
        className="flex items-start"
        style={{
          gap: "var(--space-2)",
          color: "var(--color-danger)",
          fontSize: "var(--t-meta)",
        }}
      >
        <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{message}</span>
      </div>
      <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
        <button
          onClick={onCamera}
          className="flex items-center transition-opacity active:opacity-70"
          style={{ ...ctaStyle, gap: "var(--space-1)", ...smallButton }}
        >
          <Camera size={13} />
          Camera
        </button>
        <button
          onClick={onLibrary}
          className="flex items-center transition-opacity active:opacity-70"
          style={{ ...ghostStyle, gap: "var(--space-1)", ...smallButton }}
        >
          <ImageIcon size={13} />
          From Library
        </button>
        <button
          onClick={onManual}
          className="transition-opacity active:opacity-70"
          style={{ ...ghostStyle, ...smallButton }}
        >
          Enter manually
        </button>
      </div>
    </div>
  );
}
