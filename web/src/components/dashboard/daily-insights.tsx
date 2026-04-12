"use client";

import { useEffect, useState } from "react";
import { Sparkles, Quote } from "lucide-react";

interface FactData  { fact: string | null }
interface QuoteData { quote: string | null; author: string | null }

function Skeleton() {
  return (
    <div className="space-y-2 py-0.5">
      <div className="skeleton rounded" style={{ height: 12, width: "80%", borderRadius: 4 }} />
      <div className="skeleton rounded" style={{ height: 12, width: "45%", borderRadius: 4 }} />
    </div>
  );
}

export default function DailyInsights() {
  const [fact, setFact]           = useState<string | null>(null);
  const [factLoading, setFL]      = useState(true);
  const [quote, setQuote]         = useState<string | null>(null);
  const [author, setAuthor]       = useState<string | null>(null);
  const [quoteLoading, setQL]     = useState(true);

  useEffect(() => {
    fetch("/api/fun-fact", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: FactData) => setFact(d.fact ?? null))
      .catch(() => setFact(null))
      .finally(() => setFL(false));

    fetch("/api/daily-quote", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: QuoteData) => { setQuote(d.quote ?? null); setAuthor(d.author ?? null); })
      .catch(() => setQuote(null))
      .finally(() => setQL(false));
  }, []);

  if (!factLoading && !fact && !quoteLoading && !quote) return null;

  return (
    <div
      className="flex flex-col sm:flex-row rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Fun fact */}
      <div className="flex items-start gap-3 px-5 py-4 flex-1 min-w-0">
        <Sparkles size={14} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 2 }} />
        {factLoading ? <Skeleton /> : fact ? (
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{fact}</p>
        ) : null}
      </div>

      {/* Divider */}
      <div className="sm:hidden mx-5" style={{ height: 1, background: "var(--color-border)" }} />
      <div className="hidden sm:block my-4" style={{ width: 1, background: "var(--color-border)" }} />

      {/* Quote */}
      <div className="flex items-start gap-3 px-5 py-4 flex-1 min-w-0">
        <Quote size={14} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 2 }} />
        {quoteLoading ? <Skeleton /> : quote ? (
          <div>
            <p className="text-sm leading-relaxed italic" style={{ color: "var(--color-text-muted)" }}>{quote}</p>
            {author && (
              <p className="text-xs mt-1" style={{ color: "var(--color-text-faint)" }}>— {author}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
