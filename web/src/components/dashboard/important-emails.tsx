"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import type { EmailSummary } from "@/app/api/google/gmail/route";

export default function ImportantEmails() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/google/gmail")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); return; }
        setEmails(d.emails ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const muted = { color: "var(--color-text-muted)" };
  const faint = { color: "var(--color-text-faint)" };
  const text = { color: "var(--color-text)" };

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Mail size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
        <p className="text-xs uppercase tracking-wide" style={muted}>Important Emails</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 rounded animate-pulse w-1/3" style={{ background: "var(--color-surface-raised)" }} />
              <div className="h-3 rounded animate-pulse w-4/5" style={{ background: "var(--color-surface-raised)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to load — check Google credentials</p>
      ) : emails.length > 0 ? (
        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {emails.map((email, i) => (
            <div key={i} className="py-2.5 first:pt-0 last:pb-0 min-w-0">
              <div className="flex items-baseline justify-between gap-3 mb-0.5">
                <p className="text-xs truncate" style={muted}>
                  {email.from}
                  {email.account === "professional" && (
                    <span className="ml-1.5 text-[10px]" style={faint}>work</span>
                  )}
                </p>
                {email.receivedAt && (
                  <p className="text-[10px] shrink-0" style={faint}>
                    {(() => {
                      const d = new Date(email.receivedAt);
                      const today = new Date();
                      const sameDay = d.toDateString() === today.toDateString();
                      const time = d.toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit", hour12: true,
                      });
                      if (sameDay) return time;
                      const wd = d.toLocaleDateString("en-US", { weekday: "short" });
                      return `${wd} ${d.getMonth() + 1}/${d.getDate()} ${time}`;
                    })()}
                  </p>
                )}
              </div>
              <p className="text-sm truncate" style={text}>{email.subject}</p>
              {email.snippet && (
                <p
                  className="mt-1 text-xs"
                  style={{
                    ...muted,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {email.snippet}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={faint}>Inbox clear</p>
      )}
    </div>
  );
}
