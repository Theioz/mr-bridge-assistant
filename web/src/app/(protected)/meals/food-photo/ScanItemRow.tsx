import { ChevronDown, ChevronUp, X } from "lucide-react";
import MacroLine from "./MacroLine";
import PortionPicker from "./PortionPicker";
import ScanItemEditor from "./ScanItemEditor";
import type { ScanItem } from "./types";
import { iconButtonStyle } from "./styles";

// One completed item: name + macros, portion slider, and the expandable editor.
export default function ScanItemRow({
  item,
  isFirst,
  expanded,
  onToggleExpanded,
  onRemove,
  onUpdate,
  reestimating,
  rescanning,
  rescanError,
  onReestimate,
  onRescan,
}: {
  item: ScanItem;
  isFirst: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<ScanItem>) => void;
  reestimating: boolean;
  rescanning: boolean;
  rescanError: string | null;
  onReestimate: () => void;
  onRescan: () => void;
}) {
  return (
    <div
      style={{
        borderTop: !isFirst ? "1px solid var(--rule-soft)" : "none",
        padding: "var(--space-3) 0",
      }}
    >
      <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
          <span
            style={{
              fontSize: "var(--t-body)",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            {item.label}
          </span>
          <MacroLine item={item} />
        </div>
        <div className="flex items-center flex-shrink-0" style={{ gap: "var(--space-1)" }}>
          <button
            onClick={onToggleExpanded}
            className="flex items-center transition-opacity active:opacity-70"
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "var(--space-1) var(--space-2)",
            }}
            title="Edit macros / re-estimate"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Edit
          </button>
          <button
            onClick={onRemove}
            className="transition-opacity active:opacity-70 flex items-center justify-center"
            style={iconButtonStyle}
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Portion picker — inline below name/macros (#545) */}
      <div style={{ marginTop: "var(--space-2)" }}>
        <PortionPicker
          value={item.portionFraction}
          onChange={(v) => onUpdate({ portionFraction: v })}
        />
      </div>

      {expanded && (
        <ScanItemEditor
          item={item}
          onUpdate={onUpdate}
          reestimating={reestimating}
          rescanning={rescanning}
          rescanError={rescanError}
          onReestimate={onReestimate}
          onRescan={onRescan}
        />
      )}
    </div>
  );
}
