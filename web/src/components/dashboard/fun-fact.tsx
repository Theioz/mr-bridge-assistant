"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function FunFact() {
  const [fact, setFact] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fun-fact", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFact(d.fact ?? null))
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !fact) return null;

  return (
    <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-neutral-900 border border-neutral-800">
      <Sparkles size={16} className="text-neutral-400 shrink-0 mt-0.5" />
      {loading ? (
        <div className="flex-1 space-y-2 py-0.5">
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-2/5" />
        </div>
      ) : (
        <p className="text-sm text-neutral-300 leading-relaxed">{fact}</p>
      )}
    </div>
  );
}
