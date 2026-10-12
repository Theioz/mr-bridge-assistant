// Today's macro totals and targets — ONE derivation for every surface that shows them.
//
// This was inline in app/(protected)/meals/page.tsx, with a hand-kept mirror in MealsClient for
// optimistic deletes. The dashboard now shows the same numbers (#761), and a third copy is how
// two surfaces end up disagreeing about what was eaten today. Pure, so it is unit-tested.

export interface MacroGoals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // null when no meal today reports fiber/sugar — renders as "—" not 0 (#304).
  fiber: number | null;
  sugar: number | null;
}

/** The macro columns of a meal_log row. */
export interface MacroRow {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
}

/** The profile keys macro targets live in. Select these when only the goals are needed. */
export const MACRO_GOAL_KEYS = [
  "calorie_goal",
  "protein_goal",
  "carbs_goal",
  "fat_goal",
  "fiber_goal",
] as const;

/** Profile k/v → targets. Fiber defaults to 30 g when unset — a common public-health target. */
export function macroGoalsFromProfile(
  profile: Record<string, string | null | undefined>,
): MacroGoals {
  const int = (k: string): number | null => {
    const v = profile[k];
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  return {
    calories: int("calorie_goal"),
    protein: int("protein_goal"),
    carbs: int("carbs_goal"),
    fat: int("fat_goal"),
    fiber: int("fiber_goal") ?? 30,
  };
}

/** Sum meal_log rows. Fiber/sugar stay null unless at least one row reports them. */
export function sumMacroTotals(rows: ReadonlyArray<MacroRow>): MacroTotals {
  let calories = 0,
    protein = 0,
    carbs = 0,
    fat = 0;
  let fiberSum = 0,
    sugarSum = 0,
    fiberAny = false,
    sugarAny = false;
  for (const m of rows) {
    calories += m.calories ?? 0;
    protein += m.protein_g ?? 0;
    carbs += m.carbs_g ?? 0;
    fat += m.fat_g ?? 0;
    if (m.fiber_g != null) {
      fiberSum += m.fiber_g;
      fiberAny = true;
    }
    if (m.sugar_g != null) {
      sugarSum += m.sugar_g;
      sugarAny = true;
    }
  }
  return {
    calories,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: fiberAny ? Math.round(fiberSum * 10) / 10 : null,
    sugar: sugarAny ? Math.round(sugarSum * 10) / 10 : null,
  };
}
