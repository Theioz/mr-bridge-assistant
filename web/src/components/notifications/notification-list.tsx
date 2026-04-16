"use client";

import { useState } from "react";
import { Activity, CloudRain, CheckSquare, Cake, Bell } from "lucide-react";
import type { Notification } from "@/app/(protected)/notifications/page";

const TYPE_FILTERS = [
  { key: "all",       label: "All" },
  { key: "hrv_alert", label: "HRV" },
  { key: "weather",   label: "Weather" },
  { key: "task_due",  label: "Tasks" },
  { key: "birthday",  label: "Birthday" },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]["key"];

function typeIcon(type: string) {
  switch (type) {
    case "hrv_alert": return <Activity size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />;
    case "weather":   return <CloudRain size={16} style={{ color: "var(--color-info)", flexShrink: 0 }} />;
    case "task_due":  return <CheckSquare size={16} style={{ color: "var(--color-positive)", flexShrink: 0 }} />;
    case "birthday":  return <Cake size={16} style={{ color: "var(--color-warning)", flexShrink: 0 }} />;
    default:          return <Bell size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />;
  }
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
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
}

export default function NotificationList({ notifications }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const visible = filter === "all"
    ? notifications
    : notifications.filter((n) => n.type === filter);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer"
              style={{
                background: active ? "var(--color-primary)" : "var(--color-surface)",
                color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Notification rows */}
      {visible.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No notifications yet</p>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          {visible.map((n, i) => (
            <div
              key={n.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                borderTop: i > 0 ? "1px solid var(--color-border)" : "none",
                borderLeft: n.isUnread ? "3px solid var(--color-primary)" : "3px solid transparent",
              }}
            >
              <div style={{ marginTop: 2 }}>{typeIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: n.isUnread ? 600 : 400,
                    color: "var(--color-text)",
                    lineHeight: 1.4,
                  }}
                >
                  {n.title}
                </p>
                {n.body && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {n.body}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-faint)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {relativeTime(n.sent_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
