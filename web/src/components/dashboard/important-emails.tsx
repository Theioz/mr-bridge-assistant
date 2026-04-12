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

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <div className="flex items-center gap-2 mb-3">
        <Mail size={13} className="text-neutral-500 shrink-0" />
        <p className="text-xs text-neutral-500 uppercase tracking-wide">Important Emails</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-neutral-800 rounded animate-pulse w-1/3" />
              <div className="h-3 bg-neutral-800 rounded animate-pulse w-4/5" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-400/70">Failed to load — check Google credentials</p>
      ) : emails.length > 0 ? (
        <div className="divide-y divide-neutral-800/50">
          {emails.map((email, i) => (
            <div key={i} className="py-2 first:pt-0 last:pb-0 min-w-0">
              <p className="text-xs text-neutral-400 truncate">
                {email.from}
                {email.account === "professional" && (
                  <span className="ml-1.5 text-neutral-600 text-[10px]">work</span>
                )}
              </p>
              <p className="text-sm text-neutral-200 truncate mt-0.5">{email.subject}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">Inbox clear</p>
      )}
    </div>
  );
}
