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
  completed_at: string | null;
  created_at: string;
  parent_id: string | null;
  subtasks?: Task[];
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
  active_cal: number | null;
  steps: number | null;
  activity_score: number | null;
  spo2_avg: number | null;
  body_temp_delta: number | null;
  metadata: Record<string, unknown> | null;
  source: string | null;
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

export interface Recipe {
  id: string;
  name: string;
  cuisine: string | null;
  ingredients: string | null;
  instructions: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MealLog {
  id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  recipe_id: string | null;
  notes: string | null;
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
  notes?: string | null;
}

export interface WorkoutPlan {
  id: string;
  user_id: string;
  date: string;
  name: string | null;
  warmup: WorkoutExercise[];
  workout: WorkoutExercise[];
  cooldown: WorkoutExercise[];
  notes: string | null;
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
