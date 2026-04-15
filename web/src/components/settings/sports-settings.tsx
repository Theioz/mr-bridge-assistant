"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";
import type { SportsFavorite } from "@/lib/sync/sports";
import type { Team } from "@/lib/sync/sports/provider";

interface Props {
  favorites: SportsFavorite[];
  saveAction: (favorites: SportsFavorite[]) => Promise<void>;
}

export function SportsSettings({ favorites, saveAction }: Props) {
  const [list, setList] = useState<SportsFavorite[]>(favorites);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Team[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/sports/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json() as { teams?: Team[]; error?: string };
        if (json.error) setError(json.error);
        setResults(json.teams ?? []);
      } catch (e) {
        setError((e as Error).message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleAdd(team: Team) {
    if (list.some((f) => f.team_id === team.team_id && f.league === team.league)) {
      setError(`${team.name} is already in your favorites`);
      return;
    }
    const fav: SportsFavorite = {
      team_id: team.team_id,
      name: team.name,
      league: team.league,
      league_id: team.league_id,
      badge: team.badge,
      color: team.color,
    };
    const next = [...list, fav];
    setList(next);
    setQuery("");
    setResults([]);
    startTransition(async () => {
      await saveAction(next);
    });
  }

  function handleRemove(teamId: string, league: string) {
    const next = list.filter((f) => !(f.team_id === teamId && f.league === league));
    setList(next);
    startTransition(async () => {
      await saveAction(next);
    });
  }

  return (
    <div
      id="sports"
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          Favorite Teams
        </p>
      </div>

      {/* Search */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex gap-2 items-center">
          <Search size={14} style={{ color: "var(--color-text-faint)" }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(null); }}
            placeholder="Search teams (e.g. Warriors, 49ers, Arsenal)"
            className="flex-1 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus:outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
              color: "var(--color-text)",
            }}
          />
          {searching && <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-text-faint)" }} />}
        </div>
        {error && (
          <p className="mt-1.5" style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</p>
        )}
        {results.length > 0 && (
          <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
            {results.slice(0, 8).map((t) => (
              <button
                key={`${t.league}-${t.team_id}`}
                type="button"
                onClick={() => handleAdd(t)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer transition-colors"
                style={{ background: "var(--color-surface-raised)", borderBottom: "1px solid var(--color-border)" }}
                onMouseOver={(e) => { e.currentTarget.style.background = "var(--color-surface)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "var(--color-surface-raised)"; }}
              >
                {t.badge ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.badge} alt="" width={20} height={20} style={{ borderRadius: 3, objectFit: "contain" }} />
                ) : (
                  <div style={{ width: 20, height: 20, borderRadius: 3, background: "var(--color-surface)" }} />
                )}
                <span style={{ fontSize: 13, color: "var(--color-text)" }}>{t.name}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-faint)", marginLeft: "auto" }}>{t.league}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Favorites list */}
      {list.length === 0 ? (
        <div className="px-5 py-4" style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
          No teams added yet.
        </div>
      ) : (
        list.map((fav) => (
          <div
            key={`${fav.league}-${fav.team_id}`}
            className="flex items-center gap-3 px-5 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            {fav.badge ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fav.badge} alt="" width={20} height={20} style={{ borderRadius: 3, objectFit: "contain" }} />
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: 3, background: "var(--color-surface-raised)" }} />
            )}
            <span style={{ fontSize: 13, color: "var(--color-text)", flex: 1 }}>{fav.name}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{fav.league}</span>
            <button
              onClick={() => handleRemove(fav.team_id, fav.league)}
              disabled={isPending}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer disabled:opacity-40"
              style={{ color: "var(--color-text-faint)" }}
              onMouseOver={(e) => { e.currentTarget.style.color = "var(--color-danger)"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "var(--color-text-faint)"; }}
              title={`Remove ${fav.name}`}
            >
              <X size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
