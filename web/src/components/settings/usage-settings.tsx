"use client";

import { useEffect, useState } from "react";

interface QuotaData {
  is_demo: boolean;
  chat: {
    tokens_used: number;
    tokens_cap: number;
    tool_calls_used: number;
    tool_calls_cap: number;
  };
  demo: { turns_used: number; turns_cap: number };
  resets_at: string;
}

interface StorageCategory {
  rows: number;
  bytes: number;
}

interface StorageData {
  tasks: StorageCategory;
  habits: StorageCategory;
  fitness: StorageCategory;
  meals: StorageCategory;
  journal: StorageCategory;
  chat: StorageCategory;
  watchlists: StorageCategory;
  total_all_bytes: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `~${n} B`;
  if (n < 1024 * 1024) return `~${Math.round(n / 1024)} KB`;
  return `~${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ProgressRow({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(used / cap, 1) : 0;
  const danger = pct >= 0.8;

  return (
    <div style={{ marginBottom: "var(--space-5)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--space-2)",
        }}
      >
        <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>{label}</span>
        <span
          style={{
            fontSize: "var(--t-micro)",
            color: danger ? "var(--color-danger)" : "var(--color-text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {used.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: "var(--r-1)",
          background: "var(--rule-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(pct * 100).toFixed(1)}%`,
            borderRadius: "var(--r-1)",
            background: danger ? "var(--color-danger)" : "var(--accent)",
            transition: "width var(--motion-base) var(--ease-out-quart)",
          }}
        />
      </div>
    </div>
  );
}

function StorageRow({ label, rows, bytes }: { label: string; rows: number; bytes: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: "var(--space-2)",
      }}
    >
      <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>{label}</span>
      <span
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rows.toLocaleString()} records · {formatBytes(bytes)}
      </span>
    </div>
  );
}

function SkeletonBlock({ width = "100%" }: { width?: string }) {
  return (
    <div
      style={{
        height: 14,
        width,
        borderRadius: "var(--r-1)",
        background: "var(--color-skeleton)",
        marginBottom: "var(--space-3)",
      }}
    />
  );
}

export function UsageSettings() {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [storage, setStorage] = useState<StorageData | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuota = fetch("/api/quota")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((q) => setQuota(q as QuotaData))
      .catch(() => setQuotaError(true));

    const fetchStorage = fetch("/api/usage/storage")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setStorage(s as StorageData))
      .catch(() => setStorageError(true));

    Promise.all([fetchQuota, fetchStorage]).finally(() => setLoading(false));
  }, []);

  const sectionStyle: React.CSSProperties = {
    paddingTop: "var(--space-6)",
    paddingBottom: "var(--space-6)",
    borderBottom: "1px solid var(--rule-soft)",
  };

  if (loading) {
    return (
      <>
        <section aria-label="Loading daily usage" style={sectionStyle}>
          <div className="db-section-label" style={{ marginBottom: "var(--space-5)" }}>
            Daily usage
          </div>
          <SkeletonBlock width="60%" />
          <SkeletonBlock />
          <SkeletonBlock width="60%" />
          <SkeletonBlock />
        </section>
        <section aria-label="Loading stored data" style={sectionStyle}>
          <div className="db-section-label" style={{ marginBottom: "var(--space-5)" }}>
            Stored data
          </div>
          {[60, 75, 50, 65, 45, 70].map((w, i) => (
            <SkeletonBlock key={i} width={`${w}%`} />
          ))}
        </section>
      </>
    );
  }

  const errorLine = (
    <p style={{ fontSize: "var(--t-meta)", color: "var(--color-danger)" }}>
      Failed to load. Try refreshing the page.
    </p>
  );

  const categories: (keyof Omit<StorageData, "total_all_bytes">)[] = [
    "tasks",
    "habits",
    "fitness",
    "meals",
    "journal",
    "chat",
    "watchlists",
  ];
  const totalRows = storage ? categories.reduce((sum, k) => sum + storage[k].rows, 0) : 0;
  const totalBytes = storage ? storage.total_all_bytes : 0;

  const resetLabel = quota
    ? new Date(quota.resets_at).toLocaleString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  return (
    <>
      <section aria-labelledby="usage-quota-heading" style={sectionStyle}>
        <h2 id="usage-quota-heading" className="db-section-label">
          Daily usage
        </h2>

        {quotaError || !quota ? errorLine : null}

        {quota && quota.is_demo ? (
          <ProgressRow
            label="Conversation turns"
            used={quota.demo.turns_used}
            cap={quota.demo.turns_cap}
          />
        ) : quota ? (
          <>
            <ProgressRow label="Tokens" used={quota.chat.tokens_used} cap={quota.chat.tokens_cap} />
            <ProgressRow
              label="Tool calls"
              used={quota.chat.tool_calls_used}
              cap={quota.chat.tool_calls_cap}
            />
          </>
        ) : null}

        {quota && resetLabel ? (
          <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
            Resets at {resetLabel}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="usage-storage-heading" style={sectionStyle}>
        <h2 id="usage-storage-heading" className="db-section-label">
          Stored data
        </h2>

        {storageError || !storage ? (
          errorLine
        ) : (
          <>
            {(
              [
                { label: "Tasks", cat: storage.tasks },
                { label: "Habits", cat: storage.habits },
                { label: "Fitness", cat: storage.fitness },
                { label: "Meals", cat: storage.meals },
                { label: "Journal", cat: storage.journal },
                { label: "Chat", cat: storage.chat },
                { label: "Watchlists", cat: storage.watchlists },
              ] as { label: string; cat: StorageCategory }[]
            )
              .sort((a, b) => b.cat.bytes - a.cat.bytes)
              .map(({ label, cat }) => (
                <StorageRow key={label} label={label} rows={cat.rows} bytes={cat.bytes} />
              ))}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                borderTop: "1px solid var(--rule-soft)",
                paddingTop: "var(--space-3)",
                marginTop: "var(--space-2)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-meta)",
                  fontWeight: 500,
                  color: "var(--color-text)",
                }}
              >
                Total
              </span>
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {totalRows.toLocaleString()} records · {formatBytes(totalBytes)}
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}
