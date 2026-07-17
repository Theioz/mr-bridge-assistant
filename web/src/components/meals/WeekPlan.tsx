import type { KitchenPlannedMeal } from "./KitchenPanel";

/**
 * The week ahead, as planned.
 *
 * `meal_plans` shipped with only a today-scoped read (`.eq("date", todayString())`), so a week
 * of planned meals existed in the table with no surface to render on — you could plan Sunday
 * through Saturday and see none of it until each day arrived. This is that surface.
 *
 * Empty days are rendered, not hidden. A gap is the most useful thing on this panel: it's the
 * list of decisions still owed, and it's what the Sunday planning session exists to close.
 *
 * Macros are deliberately absent. `meal_plans` carries none of its own (see
 * .claude/rules/data-sources.md) — a plan points at a cook or a recipe, and those own the
 * numbers. Restating macros here would mean either duplicating them or inventing them.
 */

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

function dayLabel(dateStr: string, today: string): { label: string; isToday: boolean } {
  if (dateStr === today) return { label: "Today", isToday: true };
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return { label: "Tomorrow", isToday: false };
  return {
    label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    isToday: false,
  };
}

export function WeekPlan({
  week,
  days,
  today,
}: {
  week: KitchenPlannedMeal[];
  days: string[];
  today: string;
}) {
  const byDate = new Map<string, KitchenPlannedMeal[]>();
  for (const p of week) {
    const list = byDate.get(p.date) ?? [];
    list.push(p);
    byDate.set(p.date, list);
  }

  const plannedCount = week.filter((p) => p.status !== "skipped").length;
  const unplannedDays = days.filter((d) => !(byDate.get(d) ?? []).length).length;

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <h2
        className="font-heading font-semibold"
        style={{
          fontSize: "var(--t-h3)",
          color: "var(--color-text)",
          marginBottom: "var(--space-1)",
        }}
      >
        This week
      </h2>
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-4)",
        }}
      >
        {plannedCount} meal{plannedCount === 1 ? "" : "s"} planned over the next {days.length} days
        {unplannedDays > 0
          ? ` · ${unplannedDays} day${unplannedDays === 1 ? "" : "s"} with nothing planned`
          : ""}
      </p>

      {days.map((date) => {
        const { label, isToday } = dayLabel(date, today);
        const meals = (byDate.get(date) ?? []).sort(
          (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type),
        );
        return (
          <div key={date} style={dayBlockStyle}>
            <p style={{ ...dayHeadStyle, color: isToday ? "var(--accent)" : "var(--color-text)" }}>
              {label}
            </p>
            {meals.length === 0 ? (
              <p style={emptyStyle}>Nothing planned</p>
            ) : (
              meals.map((p) => {
                const name = p.cooks?.name ?? p.recipes?.name ?? p.name ?? "Meal";
                const eaten = p.status === "eaten";
                const skipped = p.status === "skipped";
                return (
                  <div key={p.id} style={rowStyle}>
                    <span style={mealTypeStyle}>{p.meal_type}</span>
                    <span
                      style={{
                        ...nameStyle,
                        color: eaten || skipped ? "var(--color-text-muted)" : "var(--color-text)",
                        textDecoration: skipped ? "line-through" : undefined,
                      }}
                    >
                      {name}
                    </span>
                    <span style={statusStyle}>
                      {eaten
                        ? "eaten"
                        : skipped
                          ? "skipped"
                          : p.cooks
                            ? "ready"
                            : p.recipes
                              ? "needs cooking"
                              : ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </section>
  );
}

const dayBlockStyle: React.CSSProperties = {
  paddingBottom: "var(--space-3)",
  marginBottom: "var(--space-3)",
  borderBottom: "1px solid var(--rule-soft)",
};

const dayHeadStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--space-2)",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr auto",
  alignItems: "baseline",
  gap: "var(--space-3)",
  padding: "var(--space-1) 0",
};

const mealTypeStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  textTransform: "capitalize",
};

const nameStyle: React.CSSProperties = {
  fontSize: "var(--t-body)",
  minWidth: 0,
  overflowWrap: "anywhere",
};

const statusStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
};

const emptyStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  fontStyle: "italic",
};
