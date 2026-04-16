import { WindowSelector } from "@/components/ui/window-selector";
import type { WindowKey } from "@/lib/window";

type Props = {
  dateStr: string;
  windowKey: WindowKey;
};

export default function DashboardMasthead({ dateStr, windowKey }: Props) {
  return (
    <header
      className="font-heading"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "var(--space-4)",
        fontSize: "var(--t-meta)",
        letterSpacing: "0.02em",
      }}
    >
      <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Mr. Bridge</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          flexWrap: "wrap",
          color: "var(--color-text-faint)",
        }}
      >
        <span className="tnum">{dateStr}</span>
        <div className="hidden lg:block print:hidden">
          <WindowSelector current={windowKey} />
        </div>
      </div>
    </header>
  );
}
