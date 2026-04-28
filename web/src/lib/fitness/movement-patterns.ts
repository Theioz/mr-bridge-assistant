export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "push_horizontal",
  "push_vertical",
  "pull_horizontal",
  "pull_vertical",
  "carry",
  "core",
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EXERCISE_PATTERN_MAP: Record<string, MovementPattern[]> = {
  // Squat
  "DB Goblet Squat": ["squat"],
  "DB Sumo Squat": ["squat"],
  "DB Bulgarian Split Squat": ["squat"],
  "DB Reverse Lunge": ["squat"],
  "DB Walking Lunge": ["squat"],
  "Bodyweight Squat": ["squat"],
  "Goblet Squat": ["squat"],
  "Bulgarian Split Squat": ["squat"],
  "Reverse Lunge": ["squat"],

  // Hinge
  "DB Romanian Deadlift": ["hinge"],
  "DB Single-Leg Romanian Deadlift": ["hinge"],
  "DB Glute Bridge": ["hinge"],
  "DB Hip Thrust": ["hinge"],
  "DB Good Morning": ["hinge"],
  "Romanian Deadlift": ["hinge"],
  "Single-Leg RDL": ["hinge"],
  "Glute Bridge": ["hinge"],
  "Slider Hamstring Curl": ["hinge"],

  // Horizontal push
  "DB Chest Press (floor)": ["push_horizontal"],
  "DB Floor Press": ["push_horizontal"],
  "DB Chest Fly (floor)": ["push_horizontal"],
  "Slider Push-Up": ["push_horizontal"],
  "Push-Up": ["push_horizontal"],
  "Floor Press": ["push_horizontal"],

  // Vertical push
  "DB Overhead Press": ["push_vertical"],
  "DB Arnold Press": ["push_vertical"],
  "Pike Push-Up": ["push_vertical"],
  "Overhead Press": ["push_vertical"],

  // Horizontal pull
  "DB Bent-Over Row": ["pull_horizontal"],
  "DB Single-Arm Row": ["pull_horizontal"],
  "DB Dead Hang Row": ["pull_horizontal"],
  "DB Renegade Row": ["pull_horizontal"],
  "Inverted Row": ["pull_horizontal"],
  "TRX Row": ["pull_horizontal"],
  "Bent-Over Row": ["pull_horizontal"],
  "Single-Arm Row": ["pull_horizontal"],

  // Vertical pull
  "Pull-Up": ["pull_vertical"],
  "Chin-Up": ["pull_vertical"],
  "Banded Pulldown": ["pull_vertical"],
  "Negative Pull-Up": ["pull_vertical"],
  "Assisted Pull-Up": ["pull_vertical"],

  // Carry
  "DB Farmer's Carry": ["carry"],
  "DB Suitcase Carry": ["carry"],
  "DB Overhead Carry": ["carry"],
  "Farmer's Carry": ["carry"],

  // Core
  "Slider Body Saw": ["core"],
  Plank: ["core"],
  "Side Plank": ["core"],
  "Hollow Hold": ["core"],
  "Dead Bug": ["core"],
  "Bird Dog": ["core"],
  "Ab Wheel Rollout": ["core"],
  "Slider Pike": ["core"],

  // Auxiliary — no pattern counted
  "DB Lateral Raise": [],
  "DB Rear Delt Raise": [],
  "DB Reverse Fly": [],
  "DB Hammer Curl": [],
  "DB Bicep Curl": [],
  "DB Tricep Kickback": [],
  "DB Tricep Extension": [],
  "DB Skull Crusher": [],
  "DB Calf Raise": [],
  "DB Pullover (floor)": [],
};

export const REQUIRED_PATTERNS: MovementPattern[] = [
  "squat",
  "hinge",
  "push_horizontal",
  "push_vertical",
  "pull_horizontal",
  "pull_vertical",
  "core",
];

export function validateWeeklyCoverage(
  plannedExercises: string[],
  hasPullUpBar: boolean,
): { covered: MovementPattern[]; missing: MovementPattern[] } {
  const covered = new Set<MovementPattern>();

  for (const exercise of plannedExercises) {
    const patterns = EXERCISE_PATTERN_MAP[exercise] ?? [];
    patterns.forEach((p) => covered.add(p));
  }

  const required = hasPullUpBar
    ? REQUIRED_PATTERNS
    : REQUIRED_PATTERNS.filter((p) => p !== "pull_vertical");

  const missing = required.filter((p) => !covered.has(p));
  return { covered: Array.from(covered), missing };
}

export interface RedundancyIssue {
  exerciseA: string;
  exerciseB: string;
  sharedPattern: MovementPattern;
}

// Flags exercises that are adjacent in the plan and share a primary movement pattern.
export function checkSameDayRedundancy(exerciseNames: string[]): RedundancyIssue[] {
  const issues: RedundancyIssue[] = [];

  for (let i = 0; i < exerciseNames.length - 1; i++) {
    const patternsA = EXERCISE_PATTERN_MAP[exerciseNames[i]] ?? [];
    const patternsB = EXERCISE_PATTERN_MAP[exerciseNames[i + 1]] ?? [];
    const shared = patternsA.filter((p) => patternsB.includes(p));
    if (shared.length > 0) {
      issues.push({
        exerciseA: exerciseNames[i],
        exerciseB: exerciseNames[i + 1],
        sharedPattern: shared[0],
      });
    }
  }

  return issues;
}
