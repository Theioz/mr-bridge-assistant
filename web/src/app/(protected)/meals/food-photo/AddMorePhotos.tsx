import { Camera, ImageIcon } from "lucide-react";
import { ghostStyle } from "./styles";
import { MAX_PHOTOS } from "./utils";

const addButtonStyle = {
  ...ghostStyle,
  gap: "var(--space-2)",
  fontSize: "var(--t-micro)",
  padding: "var(--space-2) var(--space-3)",
  minHeight: 40,
  flex: 1,
} as const;

// "Add another scan" row under the item list; replaced by a notice once the cap is reached.
export default function AddMorePhotos({
  showButtons,
  capReached,
  onCamera,
  onLibrary,
}: {
  showButtons: boolean;
  capReached: boolean;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  return (
    <>
      {showButtons && !capReached && (
        <div className="flex" style={{ gap: "var(--space-2)", paddingTop: "var(--space-3)" }}>
          <button
            onClick={onCamera}
            className="flex items-center justify-center transition-opacity active:opacity-70"
            style={addButtonStyle}
          >
            <Camera size={13} />
            Take Photo
          </button>
          <button
            onClick={onLibrary}
            className="flex items-center justify-center transition-opacity active:opacity-70"
            style={addButtonStyle}
          >
            <ImageIcon size={13} />
            From Library
          </button>
        </div>
      )}
      {capReached && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-3)",
            textAlign: "center",
          }}
        >
          Maximum {MAX_PHOTOS} photos per session.
        </p>
      )}
    </>
  );
}
