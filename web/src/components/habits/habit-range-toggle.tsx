"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [7, 30, 90] as const;

interface Props {
  current: number;
}

export default function HabitRangeToggle({ current }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", String(n));
    router.push(`/habits?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            current === r
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {r}d
        </button>
      ))}
    </div>
  );
}
