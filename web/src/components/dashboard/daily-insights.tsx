"use client";

import { useEffect, useState } from "react";
import { Sparkles, Quote } from "lucide-react";

interface FactData { fact: string | null }
interface QuoteData { quote: string | null; author: string | null }

function Skeleton() {
  return (
    <div className="space-y-2 py-0.5">
      <div className="h-3 bg-neutral-800 rounded animate-pulse w-4/5" />
      <div className="h-3 bg-neutral-800 rounded animate-pulse w-2/5" />
    </div>
  );
}

export default function DailyInsights() {
  const [fact, setFact] = useState<string | null>(null);
  const [factLoading, setFactLoading] = useState(true);
  const [quote, setQuote] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fun-fact", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: FactData) => setFact(d.fact ?? null))
      .catch(() => setFact(null))
      .finally(() => setFactLoading(false));

    fetch("/api/daily-quote", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: QuoteData) => { setQuote(d.quote ?? null); setAuthor(d.author ?? null); })
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, []);

  const factDone = !factLoading && !fact;
  const quoteDone = !quoteLoading && !quote;
  if (factDone && quoteDone) return null;

  return (
    <div className="flex flex-col sm:flex-row rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
      {/* Fun fact */}
      <div className="flex items-start gap-3 px-5 py-4 flex-1 min-w-0">
        <Sparkles size={14} className="text-neutral-500 shrink-0 mt-0.5" />
        {factLoading ? <Skeleton /> : fact ? (
          <p className="text-sm text-neutral-300 leading-relaxed">{fact}</p>
        ) : null}
      </div>

      {/* Divider */}
      <div className="sm:hidden h-px bg-neutral-800 mx-5" />
      <div className="hidden sm:block w-px bg-neutral-800 my-4" />

      {/* Quote */}
      <div className="flex items-start gap-3 px-5 py-4 flex-1 min-w-0">
        <Quote size={14} className="text-neutral-500 shrink-0 mt-0.5" />
        {quoteLoading ? <Skeleton /> : quote ? (
          <div>
            <p className="text-sm text-neutral-300 leading-relaxed italic">{quote}</p>
            {author && <p className="text-xs text-neutral-600 mt-1">— {author}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
