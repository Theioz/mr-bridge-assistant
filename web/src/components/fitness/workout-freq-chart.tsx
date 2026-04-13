"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { WorkoutSession } from "@/lib/types";
import Link from "next/link";
import { GranularityToggle } from "@/components/ui/granularity-toggle";

interface Props {
  sessions: WorkoutSession[];
  days: number;
  goal?: number | null;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

function getISOWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function barColor(count: number, goal: number): string {
  if (count >= goal)      return "#10B981"; // green
  if (count === goal - 1) return "#F59E0B"; // amber
  return "#EF4444";                         // red
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay(); // 0 = Sunday, 1 = Monday
}

export function WorkoutFreqChart({ sessions, days, goal }: Props) {
  const [animate, setAnimate] = useState(true);
  const weekCount = Math.ceil(days / 7);
  const forceWeekly = days > 90;
  const [granularity, setGranularity] = useState<"daily" | "weekly">(
    forceWeekly ? "weekly" : "daily"
  );

  // When days changes and > 90, force back to weekly
  useEffect(() => {
    if (forceWeekly) setGranularity("weekly");
  }, [forceWeekly]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const now = new Date();
  const hasGoal = goal != null && goal > 0;

  // ── Weekly mode ──────────────────────────────────────────────────────────
  const weekSlots: { key: string; label: string; count: number }[] = [];
  if (granularity === "weekly") {
    for (let i = weekCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const dateStr = d.toISOString().slice(0, 10);
      const key = getISOWeekKey(dateStr);
      if (!weekSlots.find((w) => w.key === key)) {
        weekSlots.push({ key, label: getISOWeekLabel(dateStr), count: 0 });
      }
    }
    sessions.forEach((s) => {
      const key = getISOWeekKey(s.date);
      const slot = weekSlots.find((w) => w.key === key);
      if (slot) slot.count++;
    });
  }

  // ── Daily mode ───────────────────────────────────────────────────────────
  const daySlots: { key: string; label: string; count: number; isMonday: boolean }[] = [];
  if (granularity === "daily") {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      daySlots.push({
        key: dateStr,
        label: dayLabel(dateStr),
        count: 0,
        isMonday: dayOfWeek(dateStr) === 1,
      });
    }
    const sessionSet = new Set(sessions.map((s) => s.date));
    daySlots.forEach((slot) => {
      if (sessionSet.has(slot.key)) slot.count = 1;
    });
  }

  const showMonday = days > 14; // sparse ticks at >14 days

  const chartData = granularity === "weekly" ? weekSlots : daySlots;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Workout Frequency — {granularity === "daily" ? "Daily" : "Weekly"}
        </p>
        <div className="flex items-center gap-2">
          {hasGoal && granularity === "weekly" && (
            <span className="text-xs tabular-nums" style={{ color: "var(--color-text-faint)" }}>
              Goal: {goal}/wk
            </span>
          )}
          {hasGoal && granularity === "daily" && (
            <span className="text-xs tabular-nums" style={{ color: "var(--color-text-faint)" }}>
              Goal: {goal}/wk
            </span>
          )}
          <GranularityToggle
            value={granularity}
            onChange={setGranularity}
            disabled={forceWeekly}
          />
        </div>
      </div>

      {!hasGoal && (
        <p className="text-xs mb-3" style={{ color: "var(--color-text-faint)" }}>
          <Link href="/settings" className="underline" style={{ color: "var(--color-primary)" }}>
            Set your goals in Settings
          </Link>{" "}
          to see goal tracking.
        </p>
      )}

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#334155"
            tick={{ fill: "#64748B", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={(label, index) => {
              if (granularity === "daily" && showMonday) {
                return daySlots[index]?.isMonday ? label : "";
              }
              return label;
            }}
          />
          <YAxis
            stroke="#334155"
            tick={{ fill: "#64748B", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number) => [v, granularity === "daily" ? "Workout" : "Sessions"]}
          />
          {hasGoal && granularity === "weekly" && (
            <ReferenceLine
              y={goal}
              stroke="#64748B"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
          <Bar
            dataKey="count"
            name={granularity === "daily" ? "Workout" : "Sessions"}
            radius={[3, 3, 0, 0]}
            isAnimationActive={animate}
            animationDuration={300}
          >
            {chartData.map((entry) => {
              if (granularity === "daily") {
                return (
                  <Cell
                    key={entry.key}
                    fill={entry.count > 0 ? (hasGoal ? "#10B981" : "#6366F1") : "#1E2130"}
                  />
                );
              }
              return (
                <Cell
                  key={entry.key}
                  fill={hasGoal ? barColor(entry.count, goal!) : "#6366F1"}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
