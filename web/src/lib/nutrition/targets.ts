/**
 * Daily macro targets — computed, not guessed.
 *
 * This replaces an LLM call (`generateObject` → claude-haiku) that was handed
 * age, sex, weight, height, goal and training frequency and asked to "suggest
 * daily macro targets". Those are exactly the inputs to the Mifflin-St Jeor
 * equation, which is the standard clinical estimator for resting energy
 * expenditure. Computing it is deterministic, free, instant, offline, and
 * reproducible — an LLM approximating a formula is strictly worse.
 *
 * References for the constants used here:
 *   BMR      Mifflin-St Jeor (1990) — the ADA/Academy of Nutrition's preferred
 *            predictive equation for non-obese and obese adults.
 *   TDEE     Standard Harris-Benedict activity multipliers (1.2 → 1.9).
 *   Protein  1.6–2.2 g/kg is the evidence-backed range for trained individuals;
 *            the high end is used in a deficit to protect lean mass.
 *   Fat      25% of calories (>=20% keeps hormonal function intact).
 *   Carbs    the remainder — the flexible macro.
 */

export type NutritionTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type TargetInputs = {
  ageYears?: number | null;
  /** "male" | "female" — the only two the equation is defined for. */
  biologicalSex?: string | null;
  weightLb?: number | null;
  /** Where they want to get to. Stated intent beats the goal label — see below. */
  targetWeightLb?: number | null;
  heightCm?: number | null;
  /** FITNESS_GOALS ids from the onboarding wizard. */
  goal?: string | null;
  /** 0–7. */
  workoutDaysPerWeek?: number | null;
};

const LB_PER_KG = 2.20462;

/** Harris-Benedict activity multipliers, keyed by training days per week. */
function activityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 0) return 1.2; // sedentary
  if (daysPerWeek <= 2) return 1.375; // lightly active
  if (daysPerWeek <= 4) return 1.55; // moderately active
  if (daysPerWeek <= 6) return 1.725; // very active
  return 1.9; // athlete / twice-daily
}

/**
 * Calorie delta and protein target per goal.
 *
 * A deficit is a PERCENTAGE, not a flat -500 kcal: a flat cut is a much harsher
 * relative deficit for a small person than a large one.
 */
function goalProfile(goal: string | null | undefined): {
  calorieFactor: number;
  proteinPerKg: number;
} {
  switch (goal) {
    case "lose_weight":
      // 20% deficit; protein at the top of the range to preserve lean mass.
      return { calorieFactor: 0.8, proteinPerKg: 2.2 };
    case "build_muscle":
      // Modest surplus — a bigger one is mostly fat gain.
      return { calorieFactor: 1.1, proteinPerKg: 2.0 };
    case "athletic_performance":
      return { calorieFactor: 1.05, proteinPerKg: 1.8 };
    case "improve_endurance":
      // Endurance work is carb-driven: keep protein moderate, leave room for carbs.
      return { calorieFactor: 1.0, proteinPerKg: 1.6 };
    case "general_fitness":
    default:
      return { calorieFactor: 1.0, proteinPerKg: 1.8 };
  }
}

/**
 * Returns null when the inputs are insufficient to compute honestly — the caller
 * then leaves the fields blank for the user to fill in, rather than inventing
 * numbers. (The previous LLM path would happily hallucinate targets from a
 * partial profile.)
 */
export function computeNutritionTargets(input: TargetInputs): NutritionTargets | null {
  const { ageYears, biologicalSex, weightLb, targetWeightLb, heightCm, goal, workoutDaysPerWeek } =
    input;

  const sex = biologicalSex?.toLowerCase();
  // Mifflin-St Jeor requires all four. Without them there is no defensible number.
  if (!ageYears || !weightLb || !heightCm || (sex !== "male" && sex !== "female")) {
    return null;
  }

  const weightKg = weightLb / LB_PER_KG;

  // Mifflin-St Jeor BMR (kcal/day)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);

  const tdee = bmr * activityMultiplier(workoutDaysPerWeek ?? 0);

  // A stated target weight is a stronger signal of intent than the goal label —
  // someone can pick "general fitness" while aiming to drop 15 lb, and the label
  // alone would put them at maintenance. Where a meaningful target exists, it wins;
  // the label is the fallback. (2 lb dead-zone so a rounding-level difference isn't
  // read as a cut.)
  let profile = goalProfile(goal);
  if (targetWeightLb && Math.abs(targetWeightLb - weightLb) > 2) {
    profile =
      targetWeightLb < weightLb
        ? { calorieFactor: 0.8, proteinPerKg: 2.2 } // cutting
        : { calorieFactor: 1.1, proteinPerKg: 2.0 }; // gaining
  }
  const { calorieFactor, proteinPerKg } = profile;
  let calories = tdee * calorieFactor;

  // Never prescribe below BMR — that's the floor for a safe deficit.
  if (calories < bmr) calories = bmr;

  const protein_g = proteinPerKg * weightKg;
  const fat_g = (calories * 0.25) / 9; // 25% of calories, 9 kcal/g
  const carbCalories = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, carbCalories / 4);

  return {
    calories: Math.round(calories / 10) * 10, // round to nearest 10 — false precision otherwise
    protein_g: Math.round(protein_g),
    carbs_g: Math.round(carbs_g),
    fat_g: Math.round(fat_g),
  };
}
