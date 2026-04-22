"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import EmptyState from "./empty-state";
import type { SportsCache } from "@/lib/types";
import type { Game, Standing } from "@/lib/sync/sports/provider";

interface Props {
  rows: SportsCache[];
  favorites: {
    team_id: string;
    name: string;
    league: string;
    badge: string | null;
    color: string | null;
  }[];
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
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(":00", "");
  return `${wd} ${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function nextGameLabel(g: Game | undefined, league: string): string {
  if (!g) return "—";
  if (league === "F1") return `${g.opponent} · ${fmtDayTime(g.start_time)}`;
  const prefix = g.home_away === "home" ? "vs" : "@";
  return `${prefix} ${g.opponent} · ${fmtDayTime(g.start_time)}`;
}

function lastResultLabel(
  g: Game | undefined,
  league: string,
): { text: string; color: string } | null {
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
    ? s.ties != null
      ? `${s.wins}-${s.losses}-${s.ties}`
      : `${s.wins}-${s.losses}`
    : "";
  const trailing =
    s.points != null
      ? `${s.points} pts`
      : s.pct != null
        ? `(.${Math.round(s.pct * 1000)
            .toString()
            .padStart(3, "0")})`
        : "";
  const rank = s.rank ? `${s.rank}${ordinal(s.rank)} · ` : "";
  return (
    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
      <span>
        {rank}
        {s.group}
      </span>
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

function TeamLogo({
  src,
  name,
  color,
}: {
  src: string | null;
  name: string;
  color?: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={24}
        height={24}
        style={{ borderRadius: 4, objectFit: "contain" }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        background: color || "var(--color-surface-raised)",
        color: color ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
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

function TeamRow({ row, favorite }: { row: SportsCache; favorite: Props["favorites"][number] }) {
  const [open, setOpen] = useState(false);
  const next = row.data.upcoming?.[0];
  const last = row.data.recent?.[0];
  const lastLabel = lastResultLabel(last, favorite.league);

  return (
    <div style={{ borderBottom: "1px solid var(--rule-soft)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-5 py-3 cursor-pointer text-left lg:items-center"
        style={{ background: "transparent" }}
      >
        <TeamLogo src={favorite.badge ?? null} name={favorite.name} color={favorite.color} />
        <div className="flex-1 min-w-0">
          <p
            className="font-heading font-semibold break-words lg:truncate"
            style={{ fontSize: 14, color: "var(--color-text)", letterSpacing: "0.02em" }}
          >
            {favorite.name}
          </p>
          <p
            className="hidden lg:block"
            style={{ fontSize: 10, color: "var(--color-text-faint)", marginTop: 2 }}
          >
            {favorite.league}
          </p>
          <p
            className="lg:hidden"
            style={{ fontSize: 12, color: "var(--color-text)", marginTop: 2 }}
          >
            {nextGameLabel(next, favorite.league)}
          </p>
          <p
            className="lg:hidden"
            style={{
              fontSize: 11,
              color: lastLabel?.color ?? "var(--color-text-faint)",
              marginTop: 2,
            }}
          >
            {lastLabel?.text ?? "No recent result"}
          </p>
        </div>
        <div className="hidden lg:block flex-shrink-0 text-right" style={{ minWidth: 130 }}>
          <p style={{ fontSize: 12, color: "var(--color-text)" }}>
            {nextGameLabel(next, favorite.league)}
          </p>
          <p
            style={{
              fontSize: 11,
              color: lastLabel?.color ?? "var(--color-text-faint)",
              marginTop: 2,
            }}
          >
            {lastLabel?.text ?? "No recent result"}
          </p>
        </div>
        <span className="self-center flex-shrink-0" style={{ color: "var(--color-text-faint)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4" style={{ paddingLeft: 56 }}>
          {row.data.standings && (
            <div style={{ marginBottom: 10 }}>
              <p
                className="text-xs uppercase tracking-widest"
                style={{
                  color: "var(--color-text-faint)",
                  letterSpacing: "0.07em",
                  marginBottom: 4,
                }}
              >
                Standings
              </p>
              <StandingLine s={row.data.standings} />
            </div>
          )}
          {row.data.recent && row.data.recent.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-widest"
                style={{
                  color: "var(--color-text-faint)",
                  letterSpacing: "0.07em",
                  marginBottom: 4,
                }}
              >
                Last 3
              </p>
              {row.data.recent.map((g) => {
                const r = lastResultLabel(g, favorite.league);
                if (!r) return null;
                return (
                  <div
                    key={g.game_id}
                    className="flex items-center justify-between"
                    style={{ fontSize: 12, padding: "2px 0" }}
                  >
                    <span style={{ color: r.color }}>{r.text}</span>
                    <span style={{ color: "var(--color-text-faint)" }}>{fmtDay(g.start_time)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!row.data.standings && (!row.data.recent || row.data.recent.length === 0) && (
            <p style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
              No additional data available.
            </p>
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

  useEffect(() => {
    if (autoRanRef.current || favorites.length === 0) return;
    autoRanRef.current = true;
    const missingRow = favorites.some(
      (f) => !rows.some((r) => r.team_id === f.team_id && r.league === f.league),
    );
    const latest = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at > acc ? r.fetched_at : acc),
      null,
    );
    const stale = !latest || Date.now() - new Date(latest).getTime() > SPORTS_STALE_MS;
    if (missingRow || stale) {
      startTransition(async () => {
        await refreshAction();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsByTeamId = new Map(rows.map((r) => [`${r.team_id}|${r.league}`, r]));

  return (
    <section>
      <h2 className="db-section-label">Sports</h2>

      {favorites.length === 0 ? (
        <EmptyState icon={Trophy} actionHref="/settings#sports" actionLabel="Add">
          No teams on watchlist
        </EmptyState>
      ) : (
        <div
          style={{
            opacity: isPending ? 0.5 : 1,
            transition: "opacity var(--motion-fast) var(--ease-out-quart)",
          }}
        >
          {favorites.map((fav) => {
            const row = rowsByTeamId.get(`${fav.team_id}|${fav.league}`);
            if (!row) {
              return (
                <div
                  key={`${fav.league}-${fav.team_id}`}
                  className="db-row"
                  style={{ gridTemplateColumns: "auto 1fr" }}
                >
                  <TeamLogo src={fav.badge} name={fav.name} color={fav.color} />
                  <div>
                    <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>
                      {fav.name}
                    </p>
                    <p
                      style={{
                        fontSize: "var(--t-micro)",
                        color: "var(--color-text-faint)",
                        marginTop: 2,
                      }}
                    >
                      Awaiting first sync
                    </p>
                  </div>
                </div>
              );
            }
            return <TeamRow key={`${fav.league}-${fav.team_id}`} row={row} favorite={fav} />;
          })}
        </div>
      )}
    </section>
  );
}
