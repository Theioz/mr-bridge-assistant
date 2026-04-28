import type { SupabaseClient } from "@supabase/supabase-js";

interface Exercise {
  exercise: string;
  weight_lbs?: number | null;
}

interface Violation {
  exercise: string;
  requested_weight: number;
  max_available: number;
  equipment_type: string;
}

interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

// Map exercise name keywords to equipment_type values in user_equipment table.
// No match → skip validation for that exercise (user may have unlisted equipment).
const EQUIPMENT_KEYWORDS: [string[], string][] = [
  [
    [
      "dumbbell",
      " db ",
      "db curl",
      "db press",
      "db row",
      "db fly",
      "db lateral",
      "db front",
      "db lunge",
    ],
    "dumbbell pair",
  ],
  [
    ["barbell", " bb ", "squat", "deadlift", "bench press", "overhead press", "ohs", "rdl", "sumo"],
    "barbell",
  ],
  [["band", "resistance band", "banded"], "resistance band"],
  [["kettlebell", "kb "], "kettlebell"],
];

function inferEquipmentType(exerciseName: string): string | null {
  const lower = " " + exerciseName.toLowerCase() + " ";
  for (const [keywords, type] of EQUIPMENT_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return null;
}

export async function validateWeights({
  supabase,
  userId,
  exercises,
}: {
  supabase: SupabaseClient;
  userId: string;
  exercises: Exercise[];
}): Promise<ValidationResult> {
  const weightedExercises = exercises.filter((e) => e.weight_lbs != null && e.weight_lbs > 0);
  if (weightedExercises.length === 0) return { valid: true, violations: [] };

  // Collect unique equipment types we need to check
  const typesToCheck = new Set<string>();
  for (const ex of weightedExercises) {
    const t = inferEquipmentType(ex.exercise);
    if (t) typesToCheck.add(t);
  }
  if (typesToCheck.size === 0) return { valid: true, violations: [] };

  // Fetch max weight_lbs per equipment type for this user
  const { data, error } = await supabase
    .from("user_equipment")
    .select("equipment_type, weight_lbs")
    .eq("user_id", userId)
    .in("equipment_type", [...typesToCheck])
    .not("weight_lbs", "is", null);
  if (error) {
    // On DB error, skip validation rather than blocking the workout
    return { valid: true, violations: [] };
  }

  // Build max weight map
  const maxByType: Record<string, number> = {};
  for (const row of data ?? []) {
    const t = row.equipment_type as string;
    const w = row.weight_lbs as number;
    if (maxByType[t] === undefined || w > maxByType[t]) {
      maxByType[t] = w;
    }
  }

  const violations: Violation[] = [];
  for (const ex of weightedExercises) {
    const equipType = inferEquipmentType(ex.exercise);
    if (!equipType) continue;
    const maxAvailable = maxByType[equipType];
    if (maxAvailable === undefined) continue; // type not in inventory — skip
    if ((ex.weight_lbs ?? 0) > maxAvailable) {
      violations.push({
        exercise: ex.exercise,
        requested_weight: ex.weight_lbs!,
        max_available: maxAvailable,
        equipment_type: equipType,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── Equipment-cap progression ladder ─────────────────────────────────────────

export const PROGRESSION_LADDER = [
  {
    type: "add_reps" as const,
    detail: "Increase rep target by 2-3 (until 20+ rep range)",
    stimulusGain: "Low" as const,
  },
  {
    type: "add_tempo" as const,
    detail: "Add 3-second eccentric (3-1-1-0 cadence)",
    stimulusGain: "Medium" as const,
  },
  {
    type: "add_pause" as const,
    detail: "Add 2-second pause at hardest position",
    stimulusGain: "Medium" as const,
  },
  {
    type: "unilateral_convert" as const,
    detail: "Convert to single-limb variant (effective load doubles)",
    stimulusGain: "High" as const,
    example: "Goblet Squat → Bulgarian Split Squat",
  },
  {
    type: "mechanical_drop" as const,
    detail: "Start with hardest variation, drop to easier mid-set",
    stimulusGain: "High" as const,
  },
  {
    type: "band_augment" as const,
    detail: "Add resistance band looped under feet over the dumbbell",
    stimulusGain: "Medium" as const,
  },
  {
    type: "density" as const,
    detail: "Reduce rest by 30 seconds while maintaining set/rep volume",
    stimulusGain: "Medium" as const,
  },
] as const;

export type ProgressionStep = (typeof PROGRESSION_LADDER)[number];

export interface ProgressionRecommendation {
  shouldProgress: boolean;
  isAtCap: boolean;
  recommendedStep?: ProgressionStep;
  rationale: string;
}

export function getCappedExerciseProgression(opts: {
  userMaxLoadLbs: number;
  currentLoadLbs: number;
  sessionHistory: Array<{ date: string; reps: number; rpe: number; weight_lbs: number }>;
}): ProgressionRecommendation {
  const { userMaxLoadLbs, currentLoadLbs, sessionHistory } = opts;
  const isAtCap = currentLoadLbs >= userMaxLoadLbs * 0.95;
  const recent = sessionHistory.slice(-3);

  const earnedProgression =
    recent.length >= 2 && recent.slice(-2).every((s) => s.rpe <= 8 && s.reps >= 12);

  if (!earnedProgression) {
    return {
      shouldProgress: false,
      isAtCap,
      rationale: "Has not hit top of rep range at sub-RPE 9 for 2 consecutive sessions",
    };
  }

  if (!isAtCap) {
    return {
      shouldProgress: true,
      isAtCap: false,
      rationale: "Load can still increase via standard +2.5 kg upper / +5 kg lower progression",
    };
  }

  // At cap + earned progression → recommend unilateral conversion as the highest-stimulus jump
  return {
    shouldProgress: true,
    isAtCap: true,
    recommendedStep: PROGRESSION_LADDER[3], // unilateral_convert
    rationale:
      "At equipment cap with earned progression. Standard load increase impossible — apply progression ladder.",
  };
}
