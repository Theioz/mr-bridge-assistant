"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function FunFact() {
  const [fact, setFact] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fun-fact")
      .then((r) => r.json())
      .then((d) => setFact(d.fact ?? null))
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !fact) return null;

  return (
    <div className="flex items-start gap-3 pl-3 border-l border-neutral-800">
      <Sparkles size={11} className="text-neutral-600 shrink-0 mt-0.5" />
      {loading ? (
        <div className="flex-1 space-y-1.5 py-0.5">
          <div className="h-2.5 bg-neutral-800 rounded animate-pulse w-3/4" />
          <div className="h-2.5 bg-neutral-800 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <p className="text-xs text-neutral-600 italic leading-relaxed">{fact}</p>
      )}
    </div>
  );
}
