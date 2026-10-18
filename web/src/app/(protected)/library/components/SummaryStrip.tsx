import type { AllCounts, MediaType, StatusCounts } from "@/lib/types";
import { STATUS_COLORS, type Tab } from "../shared";

// ── Summary strip ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MediaType, string> = {
  game: "Games",
  show: "Shows",
  movie: "Movies",
  book: "Books",
};

const QUEUED_COLOR = "var(--rule)";

function StatusBar({ statusCounts, height = 6 }: { statusCounts: StatusCounts; height?: number }) {
  const n = statusCounts.total;
  if (n === 0) return <div style={{ height, borderRadius: 999, background: "var(--rule-soft)" }} />;
  const pct = (count: number) => `${((count / n) * 100).toFixed(1)}%`;
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: 999,
        overflow: "hidden",
        background: "var(--rule-soft)",
      }}
    >
      <div
        style={{
          width: pct(statusCounts.finished),
          background: STATUS_COLORS.finished,
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.active),
          background: STATUS_COLORS.active,
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.paused),
          background: STATUS_COLORS.paused,
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.dropped),
          background: STATUS_COLORS.dropped,
          transition: "width 0.3s",
        }}
      />
      <div
        style={{
          width: pct(statusCounts.backlog),
          background: QUEUED_COLOR,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

// House style (#761): a section label, flat figures on hairline rules, muted labels — the same
// language as /habits and /weekly. No bordered cards and no per-type colours; the only colour
// left is the status bar, whose segments are the semantic status tokens above.
export default function SummaryStrip({ counts, activeTab }: { counts: AllCounts; activeTab: Tab }) {
  const tabCounts = counts[activeTab];
  const { total, active, finished, backlog: queued, paused, dropped } = tabCounts;
  if (total === 0) return null;

  const figure = {
    fontFamily: "var(--font-display), system-ui, sans-serif",
    fontSize: "var(--t-h1)",
    fontWeight: 600,
    lineHeight: 1.1,
    color: "var(--color-text)",
  } as const;

  const figureLabel = {
    fontSize: "var(--t-micro)",
    color: "var(--color-text-muted)",
    marginTop: "var(--space-1)",
  } as const;

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <h2 className="db-section-label">
        Overview
        <span className="meta">
          · {finished} of {total} finished
        </span>
      </h2>

      {/* Media type breakdown — All tab only */}
      {activeTab === "all" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))",
            columnGap: "var(--space-5)",
            rowGap: "var(--space-4)",
            paddingBottom: "var(--space-4)",
            marginBottom: "var(--space-4)",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          {(["game", "show", "movie", "book"] as MediaType[]).map((type) => {
            const typeCounts = counts[type];
            const count = typeCounts.total;
            return (
              <div
                key={type}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                  minWidth: 0,
                }}
              >
                <div>
                  <div
                    className="tnum"
                    style={{
                      ...figure,
                      color: count > 0 ? "var(--color-text)" : "var(--color-text-faint)",
                    }}
                  >
                    {count}
                  </div>
                  <div style={figureLabel}>{TYPE_LABELS[type]}</div>
                </div>
                <StatusBar statusCounts={typeCounts} height={3} />
              </div>
            );
          })}
        </div>
      )}

      {/* Status figures */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          columnGap: "var(--space-6)",
          rowGap: "var(--space-3)",
          marginBottom: "var(--space-4)",
        }}
      >
        {[
          { label: "Total", value: total },
          { label: "Active", value: active },
          { label: "Finished", value: finished },
          { label: "Queued", value: queued },
          ...(paused > 0 ? [{ label: "Paused", value: paused }] : []),
          ...(dropped > 0 ? [{ label: "Dropped", value: dropped }] : []),
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="tnum" style={{ ...figure, fontSize: "var(--t-h2)" }}>
              {value}
            </div>
            <div style={{ ...figureLabel, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Completion bar */}
      <StatusBar statusCounts={tabCounts} height={4} />
      <div
        style={{
          display: "flex",
          columnGap: "var(--space-4)",
          rowGap: "var(--space-1)",
          marginTop: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Finished", color: STATUS_COLORS.finished, n: finished },
          { label: "Active", color: STATUS_COLORS.active, n: active },
          { label: "Paused", color: STATUS_COLORS.paused, n: paused },
          { label: "Dropped", color: STATUS_COLORS.dropped, n: dropped },
          { label: "Queued", color: QUEUED_COLOR, n: queued },
        ]
          .filter(({ n }) => n > 0)
          .map(({ label, color, n }) => (
            <span
              key={label}
              className="tnum"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
              {label} · {n}
            </span>
          ))}
      </div>
    </section>
  );
}
