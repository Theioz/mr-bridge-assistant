import type { JobState, JobStatus } from "@/lib/status/jobs";
import { formatRelative } from "@/lib/relative-time";

// Settings → Status (#761). Server-rendered: every scheduled job, its last success, and whether
// it is late. The same job list drives scripts/check_stale_signals.py, which fails its Kuma
// heartbeat (and so pages) when a row here turns "Late".

const STATE: Record<JobState, { label: string; color: string; bg: string }> = {
  ok: { label: "OK", color: "var(--color-positive)", bg: "var(--color-positive-subtle)" },
  failing: {
    label: "Last run failed",
    color: "var(--color-danger)",
    bg: "var(--color-danger-subtle)",
  },
  stale: { label: "Late", color: "var(--color-danger)", bg: "var(--color-danger-subtle)" },
  never: {
    label: "Never ran",
    color: "var(--color-text-muted)",
    bg: "var(--color-surface-raised)",
  },
};

const ORDER: Record<JobState, number> = { failing: 0, stale: 1, never: 2, ok: 3 };

export function StatusSettings({ jobs, now }: { jobs: JobStatus[]; now: Date }) {
  const sorted = [...jobs].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.label.localeCompare(b.label),
  );
  const problems = jobs.filter((j) => j.state !== "ok").length;

  return (
    <section
      aria-labelledby="status-heading"
      style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-6)" }}
    >
      <h2 id="status-heading" className="db-section-label">
        Background jobs
      </h2>
      <p
        style={{
          fontSize: "var(--t-meta)",
          color: problems ? "var(--color-danger)" : "var(--color-text-muted)",
          marginBottom: "var(--space-5)",
          maxWidth: "60ch",
        }}
      >
        {problems
          ? `${problems} of ${jobs.length} jobs need attention. Uptime Kuma pages a late job once, and again only after it recovers and fails again.`
          : `All ${jobs.length} jobs ran on schedule. If one stops, Uptime Kuma pages you.`}
      </p>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {sorted.map((j) => {
          const s = STATE[j.state];
          return (
            <li
              key={j.source}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "var(--space-2) var(--space-4)",
                padding: "var(--space-3) 0",
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                <span style={{ color: "var(--color-text)", fontWeight: 500 }}>{j.label}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                  }}
                >
                  {j.schedule}
                </span>
              </span>
              <span
                className="tnum"
                style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}
              >
                {j.lastOk ? `last success ${formatRelative(j.lastOk, now)}` : "no success recorded"}
              </span>
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: s.color,
                  background: s.bg,
                  borderRadius: 4,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
