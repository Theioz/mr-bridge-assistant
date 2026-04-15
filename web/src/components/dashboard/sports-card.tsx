"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { SportsCache } from "@/lib/types";
import type { Game, Standing } from "@/lib/sync/sports/provider";

interface Props {
  rows: SportsCache[];
  favorites: { team_id: string; name: string; league: string; badge: string | null; color: string | null }[];
  refreshAction: () => Promise<void>;
}

const WIN_COLOR = "var(--color-positive)";
const LOSS_COLOR = "var(--color-danger)";

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDayTime(iso: string): string {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(":00", "");
  return `${wd} ${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function nextGameLabel(g: Game | undefined, league: string): string {
  if (!g) return "—";
  if (league === "F1") return `${g.opponent} · ${fmtDayTime(g.start_time)}`;
  const prefix = g.home_away === "home" ? "vs" : "@";
  return `${prefix} ${g.opponent} · ${fmtDayTime(g.start_time)}`;
}

function lastResultLabel(g: Game | undefined, league: string): { text: string; color: string } | null {
  if (!g) return null;
  if (league === "F1") {
    return {
      text: `${g.opponent} · ${fmtDay(g.start_time)}`,
      color: "var(--color-text-muted)",
    };
  }
  if (!g.score || !g.result) return null;
  const prefix = g.home_away === "home" ? "vs" : "@";
  return {
    text: `${g.result} ${g.score.team}-${g.score.opponent} ${prefix} ${g.opponent}`,
    color: g.result === "W" ? WIN_COLOR : g.result === "L" ? LOSS_COLOR : "var(--color-text-muted)",
  };
}

function StandingLine({ s }: { s: Standing }) {
  const hasRecord = s.wins > 0 || s.losses > 0 || (s.ties ?? 0) > 0;
  const record = hasRecord
    ? (s.ties != null ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`)
    : "";
  const trailing = s.points != null
    ? `${s.points} pts`
    : s.pct != null
      ? `(.${Math.round(s.pct * 1000).toString().padStart(3, "0")})`
      : "";
  const rank = s.rank ? `${s.rank}${ordinal(s.rank)} · ` : "";
  return (
    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
      <span>{rank}{s.group}</span>
      {record && <span style={{ marginLeft: 8, color: "var(--color-text)" }}>{record}</span>}
      {trailing && <span style={{ marginLeft: 6 }}>{trailing}</span>}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function TeamLogo({ src, name, color }: { src: string | null; name: string; color?: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={24} height={24} style={{ borderRadius: 4, objectFit: "contain" }} />;
  }
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        background: color || "var(--color-surface-raised)",
        color: color ? "#fff" : "var(--color-text-muted)",
        fontSize: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}

function TeamRow({ row, favorite }: {
  row: SportsCache;
  favorite: Props["favorites"][number];
}) {
  const [open, setOpen] = useState(false);
  const next = row.data.upcoming?.[0];
  const last = row.data.recent?.[0];
  const lastLabel = lastResultLabel(last, favorite.league);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 cursor-pointer text-left"
        style={{ background: "transparent" }}
      >
        <TeamLogo src={favorite.badge ?? null} name={favorite.name} color={favorite.color} />
        <div className="flex-1 min-w-0">
          <p
            className="font-heading font-semibold truncate"
            style={{ fontSize: 14, color: "var(--color-text)", letterSpacing: "0.02em" }}
          >
            {favorite.name}
          </p>
          <p className="sports-card-league" style={{ fontSize: 10, color: "var(--color-text-faint)", marginTop: 2 }}>
            {favorite.league}
          </p>
        </div>
        <div className="flex-shrink-0 text-right" style={{ minWidth: 130 }}>
          <p style={{ fontSize: 12, color: "var(--color-text)" }}>
            {nextGameLabel(next, favorite.league)}
          </p>
          <p style={{ fontSize: 11, color: lastLabel?.color ?? "var(--color-text-faint)", marginTop: 2 }}>
            {lastLabel?.text ?? "No recent result"}
          </p>
        </div>
        <span style={{ color: "var(--color-text-faint)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4" style={{ paddingLeft: 56 }}>
          {row.data.standings && (
            <div style={{ marginBottom: 10 }}>
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-faint)", letterSpacing: "0.07em", marginBottom: 4 }}>
                Standings
              </p>
              <StandingLine s={row.data.standings} />
            </div>
          )}
          {row.data.recent && row.data.recent.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-faint)", letterSpacing: "0.07em", marginBottom: 4 }}>
                Last 3
              </p>
              {row.data.recent.map((g) => {
                const r = lastResultLabel(g, favorite.league);
                if (!r) return null;
                return (
                  <div key={g.game_id} className="flex items-center justify-between" style={{ fontSize: 12, padding: "2px 0" }}>
                    <span style={{ color: r.color }}>{r.text}</span>
                    <span style={{ color: "var(--color-text-faint)" }}>{fmtDay(g.start_time)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!row.data.standings && (!row.data.recent || row.data.recent.length === 0) && (
            <p style={{ fontSize: 12, color: "var(--color-text-faint)" }}>No additional data available.</p>
          )}
        </div>
      )}
    </div>
  );
}

const SPORTS_STALE_MS = 6 * 60 * 60 * 1000;

export function SportsCard({ rows, favorites, refreshAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const autoRanRef = useRef(false);

  function handleRefresh() {
    startTransition(async () => {
      await refreshAction();
    });
  }

  // Auto-refresh on mount when cache is stale (>6h) or any favorite is missing a row
  useEffect(() => {
    if (autoRanRef.current || favorites.length === 0) return;
    autoRanRef.current = true;
    const missingRow = favorites.some((f) => !rows.some((r) => r.team_id === f.team_id && r.league === f.league));
    const latest = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at > acc ? r.fetched_at : acc),
      null,
    );
    const stale = !latest || (Date.now() - new Date(latest).getTime()) > SPORTS_STALE_MS;
    if (missingRow || stale) handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsByTeamId = new Map(rows.map((r) => [`${r.team_id}|${r.league}`, r]));

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .sports-card-league { display: none; }
        }
      `}</style>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
          >
            Sports
          </p>
          {favorites.length > 0 && (
            <button
              onClick={handleRefresh}
              disabled={isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                color: isPending ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {isPending ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>

        {favorites.length === 0 ? (
          <div className="px-5 py-6 text-center" style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
            No teams —{" "}
            <Link href="/settings#sports" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>
              add favorites in Settings
            </Link>
          </div>
        ) : (
          <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s" }}>
            {favorites.map((fav) => {
              const row = rowsByTeamId.get(`${fav.team_id}|${fav.league}`);
              if (!row) {
                return (
                  <div
                    key={`${fav.league}-${fav.team_id}`}
                    className="flex items-center gap-3 px-5 py-3"
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    <TeamLogo src={fav.badge} name={fav.name} color={fav.color} />
                    <div className="flex-1">
                      <p style={{ fontSize: 14, color: "var(--color-text)" }}>{fav.name}</p>
                      <p style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>
                        Awaiting first sync — hit Refresh
                      </p>
                    </div>
                  </div>
                );
              }
              return <TeamRow key={`${fav.league}-${fav.team_id}`} row={row} favorite={fav} />;
            })}
          </div>
        )}
      </div>
    </>
  );
}
