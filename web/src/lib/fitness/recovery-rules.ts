export const MUSCLE_GROUPS = [
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "lower_back",
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EXERCISE_MUSCLE_MAP: Record<string, MuscleGroup[]> = {
  // Squat / lower
  "DB Goblet Squat": ["quads", "glutes"],
  "Goblet Squat": ["quads", "glutes"],
  "DB Sumo Squat": ["glutes", "quads"],
  "DB Bulgarian Split Squat": ["quads", "glutes"],
  "Bulgarian Split Squat": ["quads", "glutes"],
  "DB Reverse Lunge": ["quads", "glutes"],
  "Reverse Lunge": ["quads", "glutes"],
  "DB Walking Lunge": ["quads", "glutes"],
  "Bodyweight Squat": ["quads", "glutes"],

  // Hinge / posterior chain
  "DB Romanian Deadlift": ["hamstrings", "glutes", "lower_back"],
  "Romanian Deadlift": ["hamstrings", "glutes", "lower_back"],
  "DB Single-Leg Romanian Deadlift": ["hamstrings", "glutes"],
  "Single-Leg RDL": ["hamstrings", "glutes"],
  "DB Glute Bridge": ["glutes", "hamstrings"],
  "Glute Bridge": ["glutes", "hamstrings"],
  "DB Hip Thrust": ["glutes", "hamstrings"],
  "Slider Hamstring Curl": ["hamstrings"],
  "DB Good Morning": ["hamstrings", "lower_back"],
  "DB Calf Raise": ["calves"],

  // Horizontal push
  "DB Chest Press (floor)": ["chest", "triceps", "shoulders"],
  "DB Floor Press": ["chest", "triceps", "shoulders"],
  "DB Chest Fly (floor)": ["chest"],
  "Slider Push-Up": ["chest", "triceps", "shoulders"],
  "Push-Up": ["chest", "triceps", "shoulders"],
  "Floor Press": ["chest", "triceps", "shoulders"],

  // Vertical push
  "DB Overhead Press": ["shoulders", "triceps"],
  "DB Arnold Press": ["shoulders", "triceps"],
  "Overhead Press": ["shoulders", "triceps"],
  "Pike Push-Up": ["shoulders", "triceps"],

  // Horizontal pull
  "DB Bent-Over Row": ["back", "biceps"],
  "DB Single-Arm Row": ["back", "biceps"],
  "Bent-Over Row": ["back", "biceps"],
  "Single-Arm Row": ["back", "biceps"],
  "DB Dead Hang Row": ["back"],
  "DB Renegade Row": ["back", "biceps", "core"],
  "Inverted Row": ["back", "biceps"],

  // Vertical pull
  "Pull-Up": ["back", "biceps"],
  "Chin-Up": ["back", "biceps"],
  "Banded Pulldown": ["back", "biceps"],
  "Negative Pull-Up": ["back", "biceps"],
  "Assisted Pull-Up": ["back", "biceps"],

  // Shoulders / auxiliary
  "DB Lateral Raise": ["shoulders"],
  "DB Rear Delt Raise": ["shoulders"],
  "DB Reverse Fly": ["shoulders", "back"],

  // Arms
  "DB Hammer Curl": ["biceps"],
  "DB Bicep Curl": ["biceps"],
  "DB Tricep Kickback": ["triceps"],
  "DB Tricep Extension": ["triceps"],
  "DB Skull Crusher": ["triceps"],
  "DB Pullover (floor)": ["back", "chest"],

  // Core
  "Slider Body Saw": ["core"],
  Plank: ["core"],
  "Side Plank": ["core"],
  "Hollow Hold": ["core"],
  "Dead Bug": ["core"],
  "Bird Dog": ["core"],
  "Ab Wheel Rollout": ["core"],
  "Slider Pike": ["core"],
};

export interface DayPlan {
  dayOfWeek: number; // 0=Sun … 6=Sat (JS Date.getDay() convention)
  exercises: Array<{ name: string; sets: number; reps: number | string }>;
}

export interface RecoveryViolation {
  muscleGroup: MuscleGroup;
  firstDay: number;
  firstVolume: number;
  secondDay: number;
  secondVolume: number;
  hoursBetween: number;
  message: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function totalSetsForMuscle(day: DayPlan, muscle: MuscleGroup): number {
  return day.exercises
    .filter((ex) => (EXERCISE_MUSCLE_MAP[ex.name] ?? []).includes(muscle))
    .reduce((acc, ex) => acc + ex.sets, 0);
}

export function validateRecovery(plan: DayPlan[]): RecoveryViolation[] {
  const violations: RecoveryViolation[] = [];
  const sorted = [...plan].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  for (const muscle of MUSCLE_GROUPS) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const dayA = sorted[i];
      const dayB = sorted[i + 1];
      const volA = totalSetsForMuscle(dayA, muscle);
      const volB = totalSetsForMuscle(dayB, muscle);

      if (volA === 0 || volB === 0) continue;

      const hoursBetween = (dayB.dayOfWeek - dayA.dayOfWeek) * 24;
      if (hoursBetween > 48) continue;

      // Violation if both days hit muscle and second isn't clearly a deload (≤50% volume)
      if (volB > volA * 0.5) {
        violations.push({
          muscleGroup: muscle,
          firstDay: dayA.dayOfWeek,
          firstVolume: volA,
          secondDay: dayB.dayOfWeek,
          secondVolume: volB,
          hoursBetween,
          message: `${muscle} hit ${volA} sets on ${DAY_NAMES[dayA.dayOfWeek]} and ${volB} sets on ${DAY_NAMES[dayB.dayOfWeek]} (${hoursBetween}h apart — second session must be ≤${Math.ceil(volA * 0.5)} sets or moved to allow recovery)`,
        });
      }
    }
  }

  return violations;
}
