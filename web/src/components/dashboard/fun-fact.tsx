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
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
      <Sparkles size={13} className="text-neutral-500 shrink-0" />
      {loading ? (
        <div className="flex-1 space-y-1.5 py-0.5">
          <div className="h-2.5 bg-neutral-800 rounded animate-pulse w-3/4" />
        </div>
      ) : (
        <p className="text-xs text-neutral-400 italic leading-relaxed">{fact}</p>
      )}
    </div>
  );
}
