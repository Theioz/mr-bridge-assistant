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

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 border-l-2 border-l-blue-500">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={13} className="text-blue-400 shrink-0" />
        <p className="text-xs text-blue-400 uppercase tracking-wide font-medium">Fun Fact</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-full" />
          <div className="h-3 bg-neutral-800 rounded animate-pulse w-4/5" />
        </div>
      ) : fact ? (
        <p className="text-sm text-neutral-300 italic leading-relaxed">{fact}</p>
      ) : (
        <p className="text-sm text-neutral-600">No fact available.</p>
      )}
    </div>
  );
}
