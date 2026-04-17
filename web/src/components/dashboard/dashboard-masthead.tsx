import { WindowSelector } from "@/components/ui/window-selector";
import MastheadRefresh from "./masthead-refresh";
import type { WindowKey } from "@/lib/window";

type Props = {
  dateStr: string;
  windowKey: WindowKey;
  refreshStocks: () => Promise<{ rateLimited: boolean }>;
  refreshSports: () => Promise<void>;
};

export default function DashboardMasthead({
  dateStr,
  windowKey,
  refreshStocks,
  refreshSports,
}: Props) {
  return (
    <header
      className="font-heading"
      style={{
        display: "flex",
        alignItems: "center",
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
          gap: "var(--space-3)",
          flexWrap: "wrap",
          color: "var(--color-text-faint)",
        }}
      >
        <span className="tnum">{dateStr}</span>
        <div className="hidden lg:block print:hidden">
          <WindowSelector current={windowKey} />
        </div>
        <div className="print:hidden">
          <MastheadRefresh
            refreshStocks={refreshStocks}
            refreshSports={refreshSports}
          />
        </div>
      </div>
    </header>
  );
}
