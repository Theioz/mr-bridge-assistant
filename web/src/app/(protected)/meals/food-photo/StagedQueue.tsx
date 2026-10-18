import { X } from "lucide-react";
import type { StagedPhoto } from "./types";
import { bigButtonSize, ctaStyle, iconButtonStyle, textareaStyle } from "./styles";

// Photos waiting for submit (#574).
export default function StagedQueue({
  photos,
  userContext,
  onUserContextChange,
  onRemove,
  onSubmit,
}: {
  photos: StagedPhoto[];
  userContext: string;
  onUserContextChange: (v: string) => void;
  onRemove: (tempId: string, previewUrl: string | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      {/* Photo rows */}
      {photos.map((p, idx) => (
        <div
          key={p.tempId}
          className="flex items-center"
          style={{
            borderTop: idx > 0 ? "1px solid var(--rule-soft)" : "none",
            paddingTop: idx > 0 ? "var(--space-2)" : 0,
            gap: "var(--space-2)",
          }}
        >
          {p.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.previewUrl}
              alt="preview"
              style={{
                width: 48,
                height: 48,
                objectFit: "cover",
                borderRadius: "var(--r-1)",
                flexShrink: 0,
                border: "1px solid var(--rule-soft)",
              }}
            />
          )}
          <span
            style={{
              flex: 1,
              fontSize: "var(--t-meta)",
              color: "var(--color-text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {p.fileName}
          </span>
          <button
            onClick={() => onRemove(p.tempId, p.previewUrl)}
            className="transition-opacity active:opacity-70 flex items-center justify-center flex-shrink-0"
            style={iconButtonStyle}
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Context textarea — same state as empty-state textarea */}
      <textarea
        value={userContext}
        onChange={(e) => onUserContextChange(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Tell Bridge what's in the dish (optional)"
        autoComplete="off"
        autoCorrect="off"
        style={textareaStyle}
      />

      {/* Submit button */}
      <button
        onClick={onSubmit}
        className="flex items-center justify-center transition-opacity active:opacity-70"
        style={{ ...ctaStyle, ...bigButtonSize }}
      >
        Analyze {photos.length} photo{photos.length !== 1 ? "s" : ""}
      </button>
    </div>
  );
}
