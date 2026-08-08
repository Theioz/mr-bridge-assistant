/**
 * Contextual journal prompts — deterministic, no model.
 *
 * The journal is a free-write surface; these are *suggestions* of what might be
 * worth writing about today, derived from what actually happened. Same posture as
 * the workout planner and the nutrition pipeline: rules over a model, so the same
 * inputs always produce the same prompts and nothing is invented.
 *
 * `buildJournalPrompts` is pure — every input arrives on `JournalPromptContext`,
 * including today's date, so it can be exercised directly against real rows.
 */

export interface JournalPromptContext {
  /** YYYY-MM-DD in the user's timezone. */
  today: string;
  /** "No Alcohol" habit rows. `completed: true` means a dry day. */
  alcohol: { date: string; completed: boolean }[];
  /** Per-day intake totals, already summed across meals. */
  intake: { date: string; calories: number; protein_g: number }[];
  /** Oura rows, junk (total_sleep_hrs = 0) already filtered out. */
  recovery: {
    date: string;
    readiness: number | null;
    avg_hrv: number | null;
    resting_hr: number | null;
    total_sleep_hrs: number | null;
  }[];
  strength: {
    performed_on: string;
    perceived_effort: number | null;
    /** True when ANY exercise is grease-the-groove — it never sits inside a lift. */
    isGreaseTheGroove: boolean;
  }[];
  weights: { date: string; weight_lb: number }[];
  /** Habits other than "No Alcohol", for streak-break detection. */
  habits: { name: string; date: string; completed: boolean }[];
  /** Most recent journal entry strictly before today, if any. */
  lastEntryDate: string | null;
  calorieGoal: number | null;
  proteinGoal: number | null;
}

export interface JournalPrompt {
  /** Stable rule identifier — used as a React key and for debugging. */
  id: string;
  text: string;
  /** Higher wins when more rules fire than there are slots. */
  priority: number;
}

/** How many suggestions the editor shows at once. */
export const MAX_PROMPTS = 3;

/**
 * Shown when nothing notable fires. Rotated by date so the set is stable for a
 * whole day rather than reshuffling on every render.
 */
const EVERGREEN: string[] = [
  "What took up the most space in your head today?",
  "What did you avoid today, and what was underneath it?",
  "Something that went better than you expected.",
  "What would make tomorrow feel worth it?",
  "What are you tired of?",
  "Who did you think about today that you didn't talk to?",
  "What did you do today that was only for you?",
  "What is the thing you keep not writing down?",
];

/**
 * A session is grease-the-groove if **any** movement is GtG work.
 *
 * Not `every`: a GtG walk also carries accessory movements whose names have no
 * suffix — `Negative Pull-Up`, `Dead Hang` — so requiring all of them silently
 * reclassified real GtG sessions as lifts. GtG is deliberately kept out of
 * lifting sessions, so a single GtG movement is sufficient evidence.
 */
export function isGreaseTheGrooveSession(exerciseNames: string[]): boolean {
  return exerciseNames.some((name) => name.toLowerCase().includes("grease-the-groove"));
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Counts back from `before` to find the streak that was running immediately
 * prior — used to tell a broken 5-day streak apart from a habit never kept.
 */
function streakEndingBefore(rows: { date: string; completed: boolean }[], before: string): number {
  const byDate = new Map(rows.map((r) => [r.date, r.completed]));
  let length = 0;
  let cursor = shiftDate(before, -1);
  while (byDate.get(cursor) === true) {
    length += 1;
    cursor = shiftDate(cursor, -1);
  }
  return length;
}

export function buildJournalPrompts(ctx: JournalPromptContext): JournalPrompt[] {
  const { today } = ctx;
  const yesterday = shiftDate(today, -1);
  const out: JournalPrompt[] = [];

  const alcoholByDate = new Map(ctx.alcohol.map((r) => [r.date, r.completed]));
  const drankToday = alcoholByDate.get(today) === false;
  const dryToday = alcoholByDate.get(today) === true;
  const drankYesterday = alcoholByDate.get(yesterday) === false;

  // --- Alcohol: the highest-signal thing this journal can ask about ----------
  if (drankToday) {
    out.push({
      id: "alcohol-today",
      text: "What was happening in the hour before the first drink?",
      priority: 100,
    });
  } else if (dryToday && drankYesterday) {
    out.push({
      id: "alcohol-dry-after-heavy",
      text: "Yesterday wasn't dry and today was. What was different about the afternoon?",
      priority: 98,
    });
  } else if (dryToday) {
    const dryRun = streakEndingBefore(ctx.alcohol, today) + 1;
    if (dryRun >= 3) {
      out.push({
        id: "alcohol-dry-run",
        text: `${dryRun} dry days. What's actually filling that time now?`,
        priority: 82,
      });
    }
  } else if (drankYesterday) {
    // Today is unlogged — the habit is usually marked when the day is called,
    // which is after journaling. Ask without asserting how today went.
    out.push({
      id: "alcohol-yesterday-only",
      text: "Yesterday wasn't dry. How has today gone by comparison?",
      priority: 90,
    });
  }

  // --- Recovery: read HRV and RHR directly, not the readiness headline -------
  const recoveryByDate = new Map(ctx.recovery.map((r) => [r.date, r]));
  const latestRecovery = recoveryByDate.get(today) ?? recoveryByDate.get(yesterday) ?? null;
  if (latestRecovery) {
    const priorHrv = ctx.recovery
      .filter((r) => r.date < latestRecovery.date && r.avg_hrv != null)
      .slice(-7)
      .map((r) => r.avg_hrv as number);
    const baseline = mean(priorHrv);
    if (latestRecovery.avg_hrv != null && baseline != null && baseline > 0) {
      const ratio = latestRecovery.avg_hrv / baseline;
      if (ratio <= 0.7) {
        out.push({
          id: "recovery-hrv-down",
          text: `HRV is ${Math.round((1 - ratio) * 100)}% below your recent average. Does your body feel like the number?`,
          priority: 76,
        });
      } else if (ratio >= 1.3) {
        out.push({
          id: "recovery-hrv-up",
          text: "Recovery came back sharply overnight. What did you do differently yesterday?",
          priority: 58,
        });
      }
    }
    if ((latestRecovery.total_sleep_hrs ?? 0) >= 10) {
      out.push({
        id: "recovery-long-sleep",
        text: `${latestRecovery.total_sleep_hrs?.toFixed(1)} hours of sleep. Catching up, or hiding?`,
        priority: 52,
      });
    }
  }

  // --- Training -------------------------------------------------------------
  const lifted = ctx.strength.find((s) => s.performed_on === today && !s.isGreaseTheGroove);
  if (lifted) {
    if (lifted.perceived_effort != null && lifted.perceived_effort >= 8) {
      out.push({
        id: "training-hard-session",
        text: "That session was a hard one. What did it take to finish it?",
        priority: 72,
      });
    } else {
      out.push({
        id: "training-session",
        text: "You trained today. How did it actually feel, past the numbers?",
        priority: 46,
      });
    }
  }

  // --- Habit streaks: only interesting when something real was running -------
  const habitNames = [...new Set(ctx.habits.map((h) => h.name))];
  for (const name of habitNames) {
    const rows = ctx.habits.filter((h) => h.name === name);
    const brokeOn = rows.find((r) => r.date === yesterday && !r.completed);
    if (!brokeOn) continue;
    const priorStreak = streakEndingBefore(rows, yesterday);
    if (priorStreak >= 3) {
      out.push({
        id: `habit-streak-${name}`,
        text: `${name} broke a ${priorStreak}-day streak yesterday. What got in the way?`,
        priority: 68,
      });
    }
  }

  // --- Weight: a swing this fast is water, and worth saying so --------------
  const sortedWeights = [...ctx.weights].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = sortedWeights.at(-1);
  if (latestWeight) {
    const priorWindow = sortedWeights.filter(
      (w) => w.date < latestWeight.date && daysBetween(w.date, latestWeight.date) <= 3,
    );
    const earliest = priorWindow[0];
    if (earliest) {
      const delta = latestWeight.weight_lb - earliest.weight_lb;
      if (Math.abs(delta) >= 1.5) {
        out.push({
          id: "weight-swing",
          text: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} lb in ${daysBetween(earliest.date, latestWeight.date)} days — that's water, not fat. Does the scale still get to you?`,
          priority: 60,
        });
      }
    }
  }

  // --- Intake ---------------------------------------------------------------
  const todayIntake = ctx.intake.find((i) => i.date === today);
  if (todayIntake && ctx.calorieGoal && todayIntake.calories >= ctx.calorieGoal * 1.5) {
    out.push({
      id: "intake-high",
      text: "Today ran well over target. What were you actually after when you reached for it?",
      priority: 64,
    });
  }
  if (
    todayIntake &&
    ctx.proteinGoal &&
    todayIntake.calories > 0 &&
    todayIntake.protein_g <= ctx.proteinGoal * 0.6
  ) {
    out.push({
      id: "intake-protein-short",
      text: "Protein landed short today. Was that a planning problem or an appetite one?",
      priority: 40,
    });
  }

  // --- Coming back after a gap ---------------------------------------------
  if (ctx.lastEntryDate) {
    const gap = daysBetween(ctx.lastEntryDate, today);
    if (gap >= 7) {
      out.push({
        id: "journal-gap",
        text: `First entry in ${gap} days. What's happened since you last wrote?`,
        priority: 66,
      });
    }
  }

  // --- Evergreen fill -------------------------------------------------------
  const rotation = Math.abs(daysBetween("2026-01-01", today));
  for (let i = 0; out.length < MAX_PROMPTS && i < EVERGREEN.length; i++) {
    const text = EVERGREEN[(rotation + i) % EVERGREEN.length];
    out.push({ id: `evergreen-${(rotation + i) % EVERGREEN.length}`, text, priority: 10 });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, MAX_PROMPTS);
}
