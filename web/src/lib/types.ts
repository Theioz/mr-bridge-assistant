export interface HabitRegistry {
  id: string;
  name: string;
  emoji: string | null;
  category: string | null;
  icon_key: string | null;
  active: boolean;
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  notes: string | null;
}

export interface Subtask {
  id: string;
  title: string;
  status: "active" | "completed" | "archived";
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  priority: "high" | "medium" | "low" | null;
  status: "active" | "completed" | "archived";
  due_date: string | null;
  category: string | null;
  list_id: string | null;
  calendar_event_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_all_day: boolean;
  completed_at: string | null;
  created_at: string;
  parent_id: string | null;
  subtasks?: Task[];
  /** Set when this task is a generated occurrence of a recurring series (#468). */
  series_id: string | null;
  /** The series-calendar date this row represents. Distinct from due_date, which the user may edit
   *  on a single occurrence without moving the series. */
  occurrence_date: string | null;
}

/** A recurring task rule. Occurrences are `tasks` rows carrying its `series_id` (#468). */
export interface TaskSeries {
  id: string;
  list_id: string | null;
  title: string;
  priority: "high" | "medium" | "low" | null;
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  /** 0=Sun … 6=Sat. Weekly only; null for daily and monthly. */
  byweekday: number[] | null;
  starts_on: string;
  /** null = open-ended. #689 never warns about these. */
  ends_on: string | null;
  last_spawned: string | null;
  /** Set when the user chose "Let it end" — suppresses the expiry warning permanently. */
  expiry_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskList {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface FitnessLog {
  id: string;
  date: string;
  weight_lb: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  muscle_mass_lb: number | null;
  visceral_fat: number | null;
  source: string | null;
}

export interface WorkoutSession {
  id: string;
  date: string;
  start_time: string | null;
  activity: string;
  duration_mins: number | null;
  calories: number | null;
  avg_hr: number | null;
  notes: string | null;
  source: string | null;
  metadata: { hr_zones: string | null } | null;
}

export interface RecoveryMetrics {
  id: string;
  date: string;
  avg_hrv: number | null;
  resting_hr: number | null;
  sleep_score: number | null;
  readiness: number | null;
  total_sleep_hrs: number | null;
  light_hrs: number | null;
  deep_hrs: number | null;
  rem_hrs: number | null;
  awake_hrs: number | null;
  sleep_efficiency: number | null;
  vo2_max: number | null;
  active_cal: number | null;
  steps: number | null;
  activity_score: number | null;
  spo2_avg: number | null;
  body_temp_delta: number | null;
  bedtime: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
}

export interface ChatSession {
  id: string;
  device: string | null;
  started_at: string;
  last_active_at: string;
  summary: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  // #342: `content` is the denormalized text snapshot used by the session
  // sidebar preview; `parts` is the structured AI SDK v6 UIMessage.parts
  // shape used to render the message thread (text, tool calls, tool results,
  // file attachments). Both columns are populated on insert.
  content: string;
  parts: unknown[] | null;
  created_at: string;
}

export interface Profile {
  id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

/**
 * One line of a recipe's ingredient list.
 *
 * The fields exist so the macro resolver never has to re-derive them from prose. A structured row
 * with `quantity` + `unit` skips `parseFoodText()` (the local model) entirely; one that also
 * carries `fdc_id` skips USDA search and model selection too. See the 20260812 migration for why
 * that matters — in short, the model is measurably ~2x heavy on portion weights and the codebase
 * already re-lexes every number to work around it.
 */
export interface RecipeIngredient {
  /** The food, as close to a USDA name as is still readable: "ground beef, 93/7". */
  item: string;
  /** Null is legitimate — "salt, to taste" is a real ingredient. Ignored for macros. */
  quantity: number | null;
  /** "g", "ml", "tbsp", "clove", "can"… Null whenever `quantity` is. */
  unit: string | null;
  /** State at the time it goes in: "diced", "raw", "cooked", "drained". Affects USDA choice. */
  prep?: string | null;
  /** Section heading, e.g. "Sauce" / "For the tray". Ungrouped rows render as one list. */
  group?: string | null;
  optional?: boolean;
  /** Free note shown after the amount — provenance, substitutions, error bars. */
  note?: string | null;
  /**
   * USDA FoodData Central id. Pinning it makes re-resolution deterministic: USDA's top hit for
   * "chicken breast, cooked" is breaded microwaved tenders (252 kcal vs ~165), so leaving the
   * choice to a search means the same recipe can resolve differently month to month.
   */
  fdc_id?: number | null;
}

/** One step of the method. Display only — nothing in the macro path reads these. */
export interface RecipeStep {
  /** 1-based, and authoritative: render order comes from here, not array position. */
  step: number;
  text: string;
  /** Short asides that would clutter the step itself, mirroring WorkoutExercise.tips. */
  tips?: string[] | null;
  duration_mins?: number | null;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string | null;
  /**
   * LEGACY free text, one ingredient per line. Still the fallback while `ingredients_json` is
   * backfilled; prefer the structured column for anything new.
   */
  ingredients: string | null;
  /** LEGACY free text. Fallback for `steps_json`. */
  instructions: string | null;
  ingredients_json: RecipeIngredient[] | null;
  steps_json: RecipeStep[] | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MealLog {
  id: string;
  date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack" | null;
  recipe_id: string | null;
  notes: string | null;
  user_context: string | null;
  metadata: Record<string, unknown>;
}

export interface JournalResponses {
  best_moment?: string;
  challenge?: string;
  small_gratitude?: string;
  energy_check?: string;
  tomorrow_focus?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  responses: JournalResponses;
  free_write: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutExercise {
  exercise: string;
  sets?: number;
  reps?: string;
  weight_lbs?: number | null;
  weight_notation?: "per_hand" | "total" | null;
  notes?: string | null;
  description?: string | null;
  tips?: string[] | null;
  // Antagonist-superset metadata: `superset` is a slot like "A1"/"A2" (letter = the pair,
  // digit = position); `pair_with` names the partner exercise. Consecutive same-letter slots
  // are run as one superset — alternated, not as independent straight sets.
  superset?: string | null;
  pair_with?: string | null;
}

export interface ExercisePR {
  exercise_name: string;
  weight_pr_kg: number | null;
  rep_pr_reps: number | null;
  rep_pr_weight_kg: number | null;
  volume_pr_kg: number | null;
  weight_pr_achieved_at: string | null;
  rep_pr_achieved_at: string | null;
  volume_pr_achieved_at: string | null;
}

export type WorkoutPlanStatus = "planned" | "completed" | "cancelled" | "skipped";

export interface WorkoutPlan {
  id: string;
  user_id: string;
  date: string;
  name: string | null;
  warmup: WorkoutExercise[];
  workout: WorkoutExercise[];
  cooldown: WorkoutExercise[];
  notes: string | null;
  status: WorkoutPlanStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StrengthSession {
  id: string;
  user_id: string;
  workout_plan_id: string | null;
  performed_on: string;
  started_at: string | null;
  completed_at: string | null;
  perceived_effort: number | null;
  notes: string | null;
  created_at: string;
}

export interface StrengthSessionSet {
  id: string;
  session_id: string;
  exercise_name: string;
  exercise_order: number;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  notes: string | null;
  created_at: string;
}

export interface StrengthSessionWithSets extends StrengthSession {
  sets: StrengthSessionSet[];
}

export interface StocksCache {
  id: string;
  user_id: string;
  ticker: string;
  price: number | null;
  change_abs: number | null;
  change_pct: number | null;
  sparkline: { date: string; close: number }[] | null;
  fetched_at: string;
}

export interface SportsCache {
  id: string;
  user_id: string;
  team_id: string;
  league: string;
  data: import("./sync/sports/provider").SportsCacheData;
  fetched_at: string;
}

// ── Backlog ──────────────────────────────────────────────────────────────────

export type MediaType = "game" | "show" | "movie" | "book";
export type BacklogStatus = "backlog" | "active" | "paused" | "finished" | "dropped";
export type StatusCounts = Record<BacklogStatus, number> & { total: number };
export type AllCounts = {
  all: StatusCounts;
  game: StatusCounts;
  show: StatusCounts;
  movie: StatusCounts;
  book: StatusCounts;
};

export interface GameMetadata {
  platform?: string;
  genres?: string[];
  igdb_url?: string;
}

export interface ShowMetadata {
  episode_count?: number;
  season_count?: number;
  network?: string;
  genres?: string[];
  tmdb_url?: string;
}

export interface MovieMetadata {
  runtime_minutes?: number;
  genres?: string[];
  tmdb_url?: string;
}

export interface BookMetadata {
  page_count?: number;
  isbn?: string;
  publisher?: string;
  genres?: string[];
  ol_url?: string;
}

export type BacklogMetadata = GameMetadata | ShowMetadata | MovieMetadata | BookMetadata;

export interface BacklogItem {
  id: string;
  user_id: string;
  media_type: MediaType;
  title: string;
  creator: string | null;
  release_date: string | null;
  description: string | null;
  cover_url: string | null;
  external_id: string | null;
  external_source: string | null;
  metadata: BacklogMetadata | null;
  status: BacklogStatus;
  priority: number;
  rating: number | null;
  review: string | null;
  share_token: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogSession {
  id: string;
  item_id: string;
  user_id: string;
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface MetadataSearchResult {
  external_id: string;
  external_source: string;
  title: string;
  creator: string;
  release_date: string | null;
  description: string;
  cover_url: string;
  metadata: BacklogMetadata;
}
