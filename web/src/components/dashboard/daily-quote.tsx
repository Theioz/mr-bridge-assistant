"use client";

import { useEffect, useState } from "react";
import { Quote } from "lucide-react";

export default function DailyQuote() {
  const [quote, setQuote] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily-quote", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setQuote(d.quote ?? null);
        setAuthor(d.author ?? null);
      })
      .catch(() => setQuote(null))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !quote) return null;

  return (
    <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-neutral-900 border border-neutral-800">
      <Quote size={15} className="text-neutral-500 shrink-0 mt-0.5" />
      {loading ? (
        <div className="flex-1 space-y-2 py-0.5">
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-1/4" />
        </div>
      ) : (
        <div>
          <p className="text-sm text-neutral-300 leading-relaxed italic">{quote}</p>
          {author && (
            <p className="text-xs text-neutral-600 mt-1">— {author}</p>
          )}
        </div>
      )}
    </div>
  );
}
