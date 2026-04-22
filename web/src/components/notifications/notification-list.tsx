"use client";

import { useState, useTransition } from "react";
import { Activity, CloudRain, CheckSquare, Cake, Bell, BellOff } from "lucide-react";
import EmptyState from "@/components/dashboard/empty-state";
import type { Notification } from "@/app/(protected)/notifications/page";

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "hrv_alert", label: "HRV" },
  { key: "weather", label: "Weather" },
  { key: "task_due", label: "Tasks" },
  { key: "birthday", label: "Birthday" },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]["key"];

function typeIcon(type: string) {
  const shared = { color: "var(--color-text-faint)", flexShrink: 0 } as const;
  switch (type) {
    case "hrv_alert":
      return <Activity size={14} style={shared} aria-hidden />;
    case "weather":
      return <CloudRain size={14} style={shared} aria-hidden />;
    case "task_due":
      return <CheckSquare size={14} style={shared} aria-hidden />;
    case "birthday":
      return <Cake size={14} style={shared} aria-hidden />;
    default:
      return <Bell size={14} style={shared} aria-hidden />;
  }
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
  if (diffHours < 24) return diffHours === 1 ? "1h ago" : `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

interface Props {
  notifications: Notification[];
  markAllAsReadAction: () => Promise<{ error?: string }>;
}

export default function NotificationList({ notifications, markAllAsReadAction }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pending, startTransition] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);

  const visible = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);

  const unreadVisible = visible.filter((n) => n.isUnread).length;

  function handleMarkAll() {
    setMarkError(null);
    startTransition(async () => {
      const res = await markAllAsReadAction();
      if (res.error) setMarkError(res.error);
    });
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      {/* Filter pills — hairline rest, amber fill when active */}
      <div
        className="flex flex-wrap"
        style={{ gap: "var(--space-2)" }}
        role="tablist"
        aria-label="Filter notifications"
      >
        {TYPE_FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              style={{
                fontFamily: "var(--font-body), system-ui, sans-serif",
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                letterSpacing: "0.02em",
                padding: "0 var(--space-3)",
                minHeight: 44,
                minWidth: 44,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: active ? "1px solid var(--accent)" : "1px solid var(--rule)",
                borderRadius: "var(--r-1)",
                cursor: "pointer",
                transition:
                  "border-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
              }}
              className={active ? undefined : "hover-border-strong"}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Notification rows — flat section, hairline rules, no card shell */}
      {visible.length === 0 ? (
        <EmptyState icon={BellOff} paddingY={16}>
          {filter === "all" ? "No notifications in the last 30 days" : "Nothing in this category"}
        </EmptyState>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visible.map((n) => (
            <li
              key={n.id}
              className="db-row"
              style={{
                gridTemplateColumns: "12px 14px 1fr auto",
                alignItems: "baseline",
                paddingTop: "var(--space-4)",
                paddingBottom: "var(--space-4)",
              }}
            >
              {/* Unread pin (amber) / rest pin (rule-soft) */}
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: n.isUnread ? "var(--accent)" : "var(--rule-soft)",
                  alignSelf: "center",
                }}
              />

              <span style={{ alignSelf: "center", display: "inline-flex" }}>
                {typeIcon(n.type)}
              </span>

              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: "var(--t-meta)",
                    fontWeight: n.isUnread ? 600 : 400,
                    color: "var(--color-text)",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {n.title}
                </p>
                {n.body && (
                  <p
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-muted)",
                      marginTop: "var(--space-1)",
                      lineHeight: 1.4,
                    }}
                  >
                    {n.body}
                  </p>
                )}
              </div>

              <span
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  whiteSpace: "nowrap",
                  textAlign: "right",
                  alignSelf: "baseline",
                }}
                title={new Date(n.sent_at).toLocaleString()}
              >
                {relativeTime(n.sent_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer — mark-all-read, matches dashboard sync button vocabulary */}
      {notifications.length > 0 && (
        <footer
          style={{
            marginTop: "var(--space-4)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <span
            className="tnum"
            style={{
              fontSize: "var(--t-micro)",
              letterSpacing: "0.02em",
              color: markError ? "var(--color-danger)" : "var(--color-text-faint)",
            }}
          >
            {markError
              ? markError
              : pending
                ? "Marking…"
                : unreadVisible > 0
                  ? `${unreadVisible} unread in view`
                  : "All caught up"}
          </span>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={pending}
            title="Mark every notification as read"
            style={{
              fontFamily: "var(--font-body), system-ui, sans-serif",
              background: "transparent",
              border: "1px solid var(--rule)",
              color: "var(--color-text)",
              padding: "10px 14px",
              borderRadius: "var(--r-1)",
              cursor: pending ? "default" : "pointer",
              letterSpacing: "0.02em",
              transition: "border-color var(--motion-fast) var(--ease-out-quart)",
              minHeight: 44,
              minWidth: 44,
              opacity: pending ? 0.5 : 1,
              fontSize: "var(--t-micro)",
            }}
            className="hover-border-strong"
          >
            {pending ? "Marking…" : "Mark all read"}
          </button>
        </footer>
      )}
    </div>
  );
}
