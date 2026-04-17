import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import Link from "next/link";

interface MacroRow {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

interface Macro {
  key: string;
  label: string;
  unit: string;
  consumed: number;
  goal: number | null;
}

function progressColor(pct: number): string {
  if (pct > 100) return "var(--color-danger)";
  if (pct >= 85) return "var(--color-warning)";
  return "var(--color-positive)";
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(pct, 100);
  return (
    <div
      className="rounded-full overflow-hidden"
      style={{ height: 4, background: "var(--color-border)" }}
    >
      <div
        className="h-full"
        style={{
          width: "100%",
          transform: `scaleX(${clamped / 100})`,
          transformOrigin: "left center",
          background: color,
          transition: "transform var(--motion-slow) var(--ease-out-quart), background-color var(--motion-slow) var(--ease-out-quart)",
          willChange: "transform",
        }}
      />
    </div>
  );
}

function MacroRow({ macro }: { macro: Macro }) {
  if (macro.goal === null) return null;
  const pct = macro.goal > 0 ? (macro.consumed / macro.goal) * 100 : 0;
  const color = progressColor(pct);
  const remaining = macro.goal - macro.consumed;
  const isOver = remaining < 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>
          {macro.label}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span style={{ fontSize: 13, color: "var(--color-text)" }}>
            {macro.consumed}
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
              {macro.unit}
            </span>
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>/</span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {macro.goal}
            {macro.unit}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color,
              minWidth: 52,
              textAlign: "right",
            }}
          >
            {isOver
              ? `+${Math.abs(remaining)}${macro.unit} over`
              : `${remaining}${macro.unit} left`}
          </span>
        </div>
      </div>
      <ProgressBar pct={pct} color={color} />
    </div>
  );
}

export default async function MacroSummaryCard() {
  const supabase = await createClient();
  const today = todayString();

  const [{ data: meals }, { data: profile }] = await Promise.all([
    supabase
      .from("meal_log")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("date", today)
      .not("calories", "is", null),
    supabase.from("profile").select("key, value"),
  ]);

  const profileMap: Record<string, string> = {};
  for (const row of profile ?? []) {
    profileMap[row.key] = row.value;
  }

  const calorieGoal = profileMap["calorie_goal"] ? parseInt(profileMap["calorie_goal"], 10) : null;
  const proteinGoal = profileMap["protein_goal"] ? parseInt(profileMap["protein_goal"], 10) : null;
  const carbsGoal = profileMap["carbs_goal"] ? parseInt(profileMap["carbs_goal"], 10) : null;
  const fatGoal = profileMap["fat_goal"] ? parseInt(profileMap["fat_goal"], 10) : null;

  const hasAnyGoal =
    calorieGoal !== null || proteinGoal !== null || carbsGoal !== null || fatGoal !== null;

  const rows = (meals ?? []) as MacroRow[];
  const hasData = rows.length > 0;

  const totals = rows.reduce(
    (acc: { calories: number; protein_g: number; carbs_g: number; fat_g: number }, row) => ({
      calories: acc.calories + (row.calories ?? 0),
      protein_g: acc.protein_g + (row.protein_g ?? 0),
      carbs_g: acc.carbs_g + (row.carbs_g ?? 0),
      fat_g: acc.fat_g + (row.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const macros: Macro[] = [
    { key: "calories", label: "Calories", unit: " kcal", consumed: totals.calories, goal: calorieGoal },
    { key: "protein", label: "Protein", unit: "g", consumed: Math.round(totals.protein_g), goal: proteinGoal },
    { key: "carbs", label: "Carbs", unit: "g", consumed: Math.round(totals.carbs_g), goal: carbsGoal },
    { key: "fat", label: "Fat", unit: "g", consumed: Math.round(totals.fat_g), goal: fatGoal },
  ];

  return (
    <div
      className="rounded-xl p-5 card-lift"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        transition: "border-color var(--motion-base) var(--ease-out-quart), box-shadow var(--motion-base) var(--ease-out-quart), transform var(--motion-base) var(--ease-out-quart)",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-4"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Today&apos;s Macros
      </p>

      {!hasAnyGoal ? (
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          No nutrition goals set.{" "}
          <Link
            href="/settings"
            style={{ color: "var(--color-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Configure goals in Settings
          </Link>{" "}
          to track progress here.
        </p>
      ) : !hasData ? (
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>
          No macro data yet today
        </p>
      ) : (
        <div className="space-y-4">
          {macros.map((m) =>
            m.goal !== null ? <MacroRow key={m.key} macro={m} /> : null
          )}
        </div>
      )}
    </div>
  );
}
