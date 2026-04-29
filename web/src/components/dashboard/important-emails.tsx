"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import EmptyState from "./empty-state";
import type { EmailSummary } from "@/app/api/google/gmail/route";

export default function ImportantEmails() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/google/gmail")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(true);
          return;
        }
        setEmails(d.emails ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <h2 className="db-section-label">Inbox</h2>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ padding: "var(--space-3) 0" }}>
              <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 14, width: "80%" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--t-meta)" }}>
          Failed to load — check Google credentials
        </p>
      ) : emails.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {emails.map((email, i) => {
            const time = email.receivedAt
              ? (() => {
                  const d = new Date(email.receivedAt);
                  const today = new Date();
                  const sameDay = d.toDateString() === today.toDateString();
                  const t = d.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  if (sameDay) return t;
                  return d.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "numeric",
                    day: "numeric",
                  });
                })()
              : null;

            return (
              <li key={i} className="db-row" style={{ gridTemplateColumns: "12px 1fr auto" }}>
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--accent)",
                    alignSelf: "center",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--color-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {email.subject}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {email.from}
                    {email.account === "professional" && (
                      <span style={{ marginLeft: 6 }}>· work</span>
                    )}
                  </div>
                </div>
                {time && (
                  <span
                    className="tnum"
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    {time}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Mail} paddingY={16}>
          Inbox clear
        </EmptyState>
      )}
    </section>
  );
}
