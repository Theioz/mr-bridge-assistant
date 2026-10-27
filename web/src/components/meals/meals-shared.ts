import type { RecipeIngredient, RecipeStep } from "@/lib/types";

// Types, constants and inline-style objects shared by the /meals client modules (#777).

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MealRow {
  id: string;
  date: string;
  meal_type: string;
  notes: string | null;
  user_context: string | null;
  recipes: { name: string } | null;
  // A meal logged from a cook (the "Ate this" path) carries the cook, not a recipe. Without
  // this the row had no name to show and rendered as "—".
  cooks: { name: string } | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
}

export interface RecipeRow {
  id: string;
  name: string;
  cuisine: string | null;
  tags: string[] | null;
  ingredients: string | null;
  instructions: string | null;
  ingredients_json: RecipeIngredient[] | null;
  steps_json: RecipeStep[] | null;
  /** What a full batch makes; the base the PortionScaler scales from. */
  typical_portions: number | null;
}

export interface DailyMacroTotals {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MEAL_ORDER: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

// ─── Shared styles ────────────────────────────────────────────────────────────

export const inputStyle = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16, // Prevents iOS auto-zoom on focus
  borderRadius: "var(--r-2)",
  padding: "var(--space-2) var(--space-3)",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

export const ctaStyle = {
  background: "var(--accent)",
  color: "var(--color-text-on-cta)",
  border: "none",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  fontWeight: 500,
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;

export const ghostStyle = {
  background: "transparent",
  color: "var(--color-text-muted)",
  border: "1px solid var(--rule)",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;
