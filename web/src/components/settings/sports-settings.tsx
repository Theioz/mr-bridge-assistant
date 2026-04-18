"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, Loader2, Plus } from "lucide-react";
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
    if (!query.trim()) return;
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
    <section
      id="sports"
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 className="db-section-label">Favorite Teams</h2>

      {/* Search — inline, hairline bottom rule */}
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          paddingTop: "var(--space-2)",
          paddingBottom: "var(--space-3)",
        }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <Search
            size={16}
            style={{ color: "var(--color-text-faint)", flexShrink: 0 }}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              setError(null);
              if (!val.trim()) setResults([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                handleAdd(results[0]);
              }
            }}
            placeholder="Search teams (e.g. Warriors, 49ers, Arsenal)"
            className="flex-1 bg-transparent focus:outline-none min-w-0"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-body)",
              caretColor: "var(--accent)",
              minHeight: 44,
              border: "none",
            }}
          />
          {searching && (
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: "var(--color-text-faint)", flexShrink: 0 }}
            />
          )}
        </div>
        {error && (
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-danger)",
              marginTop: "var(--space-2)",
            }}
          >
            {error}
          </p>
        )}
        {results.length > 0 && (
          <div
            style={{
              marginTop: "var(--space-3)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              overflow: "hidden",
            }}
          >
            {results.slice(0, 8).map((t, i) => (
              <button
                key={`${t.league}-${t.team_id}`}
                type="button"
                onClick={() => handleAdd(t)}
                className="w-full flex items-center text-left cursor-pointer hover-bg-subtle"
                style={{
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "transparent",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                  minHeight: 44,
                  transition: "background var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                <Plus size={14} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
                {t.badge ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.badge}
                    alt=""
                    width={20}
                    height={20}
                    style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      background: "var(--color-surface-raised)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </span>
                <span
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    flexShrink: 0,
                  }}
                >
                  {t.league}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Favorites list — hairline-separated rows */}
      {list.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-4)",
          }}
        >
          No teams added yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map((fav, i) => (
            <li
              key={`${fav.league}-${fav.team_id}`}
              className="flex items-center"
              style={{
                gap: "var(--space-3)",
                paddingTop: "var(--space-3)",
                paddingBottom: "var(--space-3)",
                borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                minHeight: 44,
              }}
            >
              {fav.badge ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fav.badge}
                  alt=""
                  width={20}
                  height={20}
                  style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 3,
                    background: "var(--color-surface-raised)",
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fav.name}
              </span>
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  flexShrink: 0,
                }}
              >
                {fav.league}
              </span>
              <button
                onClick={() => handleRemove(fav.team_id, fav.league)}
                disabled={isPending}
                className="flex items-center justify-center cursor-pointer disabled:opacity-40 hover-text-danger"
                style={{
                  width: 44,
                  height: 44,
                  color: "var(--color-text-faint)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--r-1)",
                  flexShrink: 0,
                  transition: "color var(--motion-fast) var(--ease-out-quart)",
                }}
                title={`Remove ${fav.name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
