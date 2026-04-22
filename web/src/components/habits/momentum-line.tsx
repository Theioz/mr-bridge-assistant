"use client";

import type { HabitRegistry } from "@/lib/types";
import { getLastNDays } from "@/lib/timezone";
import { formatDate } from "@/lib/chart-utils";
import { ChartFrame, TrendLine } from "@/components/charts/primitives";

interface Props {
  habits: HabitRegistry[];
  allCompleted: { habit_id: string; date: string }[];
  today: string;
}

const WINDOW_DAYS = 30;
const ROLL_DAYS = 7;

export function MomentumLine({ habits, allCompleted, today }: Props) {
  const last30 = getLastNDays(WINDOW_DAYS);
  const oldestInWindow = last30[0];

  const rollStart = new Date(oldestInWindow + "T00:00:00Z");
  rollStart.setUTCDate(rollStart.getUTCDate() - (ROLL_DAYS - 1));
  const rollStartStr = rollStart.toISOString().slice(0, 10);

  const completedSet = new Set<string>();
  const completedDates = new Set<string>();
  for (const log of allCompleted) {
    if (log.date >= rollStartStr && log.date <= today) {
      completedSet.add(`${log.habit_id}:${log.date}`);
      completedDates.add(log.date);
    }
  }

  const activeCount = habits.length;

  const distinctDaysIn30 = Array.from(completedDates).filter(
    (d) => d >= oldestInWindow && d <= today,
  ).length;

  if (activeCount === 0 || distinctDaysIn30 < ROLL_DAYS) {
    return (
      <ChartFrame label="Momentum · 30D">
        <div
          className="flex items-center"
          style={{
            height: 160,
            fontSize: "var(--t-body)",
            color: "var(--color-text-faint)",
          }}
        >
          Not enough history yet — 7 days of logs needed to show momentum.
        </div>
      </ChartFrame>
    );
  }

  const denom = activeCount * ROLL_DAYS;
  const values: number[] = [];
  const labels: string[] = [];

  for (const d of last30) {
    const end = new Date(d + "T00:00:00Z");
    let hits = 0;
    for (let i = 0; i < ROLL_DAYS; i++) {
      const day = new Date(end);
      day.setUTCDate(day.getUTCDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      for (const h of habits) {
        if (completedSet.has(`${h.id}:${dayStr}`)) hits++;
      }
    }
    values.push((hits / denom) * 100);
    labels.push(formatDate(d));
  }

  const todayRate = Math.round(values[values.length - 1]);
  const trailingAvg = values.reduce((a, b) => a + b, 0) / values.length;
  const avgRounded = Math.round(trailingAvg);

  return (
    <ChartFrame label="Momentum · 30D" value={`today ${todayRate}% · avg ${avgRounded}%`}>
      <TrendLine
        values={values}
        labels={labels}
        todayIndex={values.length - 1}
        refLines={[{ y: trailingAvg, label: `avg ${avgRounded}%`, dashed: true }]}
        formatValue={(v) => `${Math.round(v)}%`}
        ariaLabel="Habit momentum — rolling 7-day completion rate, last 30 days"
        endpointRight="Today"
        yDomain={[0, 100]}
        fill
      />
    </ChartFrame>
  );
}
