import { useRef } from "react";
import { Camera, ImageIcon } from "lucide-react";
import { bigButtonSize, ctaStyle, ghostStyle, textareaStyle } from "./styles";

// Dashed upload zone shown before any photo is added.
export default function EmptyState({
  userContext,
  onUserContextChange,
  onCamera,
  onLibrary,
}: {
  userContext: string;
  onUserContextChange: (v: string) => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const scanCtaRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="flex flex-col items-center"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-7) var(--space-4)",
        border: "1px dashed var(--rule)",
        borderRadius: "var(--r-2)",
      }}
    >
      <p
        style={{
          fontSize: "var(--t-body)",
          color: "var(--color-text-muted)",
          textAlign: "center",
        }}
      >
        Scan a nutrition label or food photo to get started.
      </p>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <textarea
          value={userContext}
          onChange={(e) => onUserContextChange(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell Bridge what's in the dish (optional)"
          autoComplete="off"
          autoCorrect="off"
          onFocus={() =>
            scanCtaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
          }
          style={textareaStyle}
        />
        {userContext.length > 0 && (
          <div
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              textAlign: "right",
              marginTop: "var(--space-1)",
            }}
          >
            {userContext.length}/500
          </div>
        )}
      </div>
      <div
        ref={scanCtaRef}
        className="flex flex-wrap justify-center"
        style={{ gap: "var(--space-2)" }}
      >
        <button
          onClick={onCamera}
          className="flex items-center justify-center transition-opacity active:opacity-70"
          style={{ ...ctaStyle, gap: "var(--space-2)", ...bigButtonSize }}
        >
          <Camera size={17} />
          Take Photo
        </button>
        <button
          onClick={onLibrary}
          className="flex items-center justify-center transition-opacity active:opacity-70"
          style={{ ...ghostStyle, gap: "var(--space-2)", ...bigButtonSize }}
        >
          <ImageIcon size={17} />
          From Library
        </button>
      </div>
    </div>
  );
}
