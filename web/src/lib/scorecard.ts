/**
 * Weekly scorecard: the plain-numbers week in review on /weekly.
 *
 * TypeScript twin of scripts/_scorecard.py — the /weekly panel and the Sunday push must report the
 * same numbers, so the definitions live in both places and are pinned by tests on both sides
 * (web/src/__tests__/scorecard.test.ts, tests/test_scorecard.py). Change one, change the other.
 *
 * Pure and I/O-free: the page fetches rows and passes them in. Dates are YYYY-MM-DD strings in
 * the user's timezone throughout; `today` must come from todayString(), never a `Date`.
 *
 * Why each number is here:
 * - Alcohol is reported as STANDARD DRINKS, not calories. Calories understate it and make it read
 *   as a diet problem; moderation targets are written in drinks.
 * - The alcohol share of the deficit separates "the cooking is off" from "the deficit is being
 *   drunk" — two stalls that look identical on the scale and need opposite fixes. It is only
 *   computed when at least 5 days were logged; a share over a half-logged week is noise.
 * - Unlogged days count as dry, and the panel says so rather than hiding it.
 */

export const SCORECARD_DEFAULTS = {
  steps_goal: 10000,
  target_rate_lb_wk: 0.75,
  tdee_estimate: 2350,
  workout_days_per_week: 3,
} as const;
export const MIN_LOGGED_DAYS_FOR_SHARE = 5;
export const MIN_READINGS_FOR_PROJECTION = 6;
export const PROJECTION_WINDOW_DAYS = 28;

export interface FitnessRow {
  date: string;
  weight_lb: number | string | null;
}
/** Must already be PROGRAMMED sessions only (workout_plan_id not null) — walk pull-ups are not. */
export interface SessionRow {
  performed_on: string;
}
export interface RecoveryRow {
  date: string;
  steps: number | null;
}
export interface MealRow {
  date: string;
  calories: number | null;
  protein_g: number | string | null;
  standard_drinks?: number | string | null;
  origin?: string | null;
}
export interface PlanRow {
  date: string;
  is_cheat?: boolean | null;
}

export type Breach = "weekly cap" | "dry days" | "per occasion";

export interface Scorecard {
  weight7: number | null;
  prev7: number | null;
  delta: number | null;
  goal: number | null;
  expected: number | null;
  landing: string | null;
  sessions: number;
  sessionsTarget: number;
  stepsDays: number;
  stepsGoal: number;
  daysLogged: number;
  avgKcal: number | null;
  avgProtein: number | null;
  cheatMeals: number;
  deliveryN: number;
  deliveryKcal: number;
  drinks: number;
  drinkingDays: number;
  dryDays: number;
  maxDay: number;
  alcoholKcal: number;
  alcoholSharePct: number | null;
  cap: number | null;
  dryMin: number | null;
  perOccasion: number | null;
  breaches: Breach[];
}

// ── Date + number helpers (string dates, UTC-noon anchored so DST never shifts a day) ──

function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const day = (v: string) => v.slice(0, 10);
const inRange = (d: string, start: string, end: string) => d >= start && d <= end;

function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Python's round(): half to even. The landing date's day count is rounded this way in the twin,
 * so an exact .5 must go the same direction here or the two surfaces disagree by a day.
 */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** A profile number, falling back to the default (if the key has one) when unset or invalid. */
function num(profile: Record<string, string | undefined>, key: string): number | null {
  const fallback = (SCORECARD_DEFAULTS as Record<string, number>)[key] ?? null;
  const raw = profile[key];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// ── Pieces ──────────────────────────────────────────────────────────────────────

export function weightMean(
  rows: FitnessRow[],
  start: string,
  end: string,
  excluded: ReadonlySet<string> = new Set(),
): number | null {
  return mean(
    rows
      .filter((r) => r.weight_lb != null && inRange(day(r.date), start, end))
      .filter((r) => !excluded.has(day(r.date)))
      .map((r) => Number(r.weight_lb)),
  );
}

/** Least-squares slope over the last 28 days of readings; null unless it trends down. */
export function projectedLanding(
  rows: FitnessRow[],
  today: string,
  current: number | null,
  goal: number | null,
  excluded: ReadonlySet<string> = new Set(),
): string | null {
  if (current == null || goal == null) return null;
  const start = addDays(today, -(PROJECTION_WINDOW_DAYS - 1));
  const pts = rows
    .filter((r) => r.weight_lb != null && inRange(day(r.date), start, today))
    .filter((r) => !excluded.has(day(r.date)))
    .map((r) => [daysBetween(start, r.date), Number(r.weight_lb)] as const);
  if (pts.length < MIN_READINGS_FOR_PROJECTION) return null;
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  const variance = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (variance === 0) return null;
  const slope = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / variance; // lb/day
  if (slope >= 0) return null;
  if (current <= goal) return today;
  return addDays(today, roundHalfEven((current - goal) / -slope));
}

// ── Scorecard ───────────────────────────────────────────────────────────────────

export function computeScorecard(input: {
  today: string;
  profile: Record<string, string | undefined>;
  fitness: FitnessRow[];
  sessions: SessionRow[];
  recovery: RecoveryRow[];
  meals: MealRow[];
  plans: PlanRow[];
  /** Weigh-in dates to leave out of the weight numbers (e.g. travel). Optional. */
  excludedWeighIns?: ReadonlySet<string>;
}): Scorecard {
  const { today, profile } = input;
  const excluded = input.excludedWeighIns ?? new Set<string>();
  const start = addDays(today, -6);
  const prevStart = addDays(today, -13);
  const prevEnd = addDays(today, -7);

  const weight7 = weightMean(input.fitness, start, today, excluded);
  const prev7 = weightMean(input.fitness, prevStart, prevEnd, excluded);
  const goal = num(profile, "weight_goal_lbs");

  let expected: number | null = null;
  const startWeight = num(profile, "phase_start_weight");
  if (profile.phase_start_date && startWeight != null) {
    const weeks = daysBetween(profile.phase_start_date, today) / 7;
    expected = startWeight - (num(profile, "target_rate_lb_wk") as number) * weeks;
  }

  const sessions = new Set(
    input.sessions.map((s) => day(s.performed_on)).filter((d) => inRange(d, start, today)),
  ).size;

  const stepsByDay = new Map<string, number>();
  for (const r of input.recovery) {
    const d = day(r.date);
    if (r.steps != null && inRange(d, start, today)) {
      stepsByDay.set(d, Math.max(stepsByDay.get(d) ?? 0, Number(r.steps)));
    }
  }
  const stepsGoal = num(profile, "steps_goal") as number;
  const stepsDays = [...stepsByDay.values()].filter((v) => v >= stepsGoal).length;

  const kcalByDay = new Map<string, number>();
  const proteinByDay = new Map<string, number>();
  const drinksByDay = new Map<string, number>();
  let foodOnlyKcal = 0;
  let alcoholKcal = 0;
  let deliveryN = 0;
  let deliveryKcal = 0;
  for (const r of input.meals) {
    const d = day(r.date);
    if (!inRange(d, start, today)) continue;
    const kcal = Number(r.calories ?? 0) || 0;
    kcalByDay.set(d, (kcalByDay.get(d) ?? 0) + kcal);
    proteinByDay.set(d, (proteinByDay.get(d) ?? 0) + (Number(r.protein_g ?? 0) || 0));
    const drinks = Number(r.standard_drinks ?? 0) || 0;
    if (drinks > 0) {
      drinksByDay.set(d, (drinksByDay.get(d) ?? 0) + drinks);
      alcoholKcal += kcal;
    } else {
      foodOnlyKcal += kcal;
    }
    if (r.origin === "delivery") {
      deliveryN += 1;
      deliveryKcal += kcal;
    }
  }
  const daysLogged = kcalByDay.size;

  const tdee = num(profile, "tdee_estimate") as number;
  const foodDeficit = daysLogged >= MIN_LOGGED_DAYS_FOR_SHARE ? 7 * tdee - foodOnlyKcal : null;
  const alcoholSharePct =
    foodDeficit != null && foodDeficit > 0 ? (alcoholKcal / foodDeficit) * 100 : null;

  const drinkTotals = [...drinksByDay.values()];
  const drinks = round1(drinkTotals.reduce((a, b) => a + b, 0));
  const drinkingDays = drinkTotals.filter((v) => v > 0).length;
  const dryDays = 7 - drinkingDays;
  const maxDay = drinkTotals.length ? round1(Math.max(...drinkTotals)) : 0;

  const cap = num(profile, "alcohol_weekly_cap");
  const dryMin = num(profile, "alcohol_dry_days_min");
  const perOccasion = num(profile, "alcohol_max_per_occasion");
  const breaches: Breach[] = [];
  if (cap != null && drinks > cap) breaches.push("weekly cap");
  if (dryMin != null && dryDays < dryMin) breaches.push("dry days");
  if (perOccasion != null && maxDay > perOccasion) breaches.push("per occasion");

  return {
    weight7,
    prev7,
    delta: weight7 != null && prev7 != null ? weight7 - prev7 : null,
    goal,
    expected,
    landing: projectedLanding(input.fitness, today, weight7, goal, excluded),
    sessions,
    sessionsTarget: Math.trunc(num(profile, "workout_days_per_week") as number),
    stepsDays,
    stepsGoal: Math.trunc(stepsGoal),
    daysLogged,
    avgKcal: mean([...kcalByDay.values()]),
    avgProtein: mean([...proteinByDay.values()]),
    cheatMeals: input.plans.filter((p) => p.is_cheat && inRange(day(p.date), start, today)).length,
    deliveryN,
    deliveryKcal: Math.round(deliveryKcal),
    drinks,
    drinkingDays,
    dryDays,
    maxDay,
    alcoholKcal: Math.round(alcoholKcal),
    alcoholSharePct,
    cap,
    dryMin,
    perOccasion,
    breaches,
  };
}
