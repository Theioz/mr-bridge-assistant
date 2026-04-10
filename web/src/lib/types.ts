export interface HabitRegistry {
  id: string;
  name: string;
  emoji: string | null;
  category: string | null;
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

export interface Task {
  id: string;
  title: string;
  priority: "high" | "medium" | "low" | null;
  status: "active" | "completed" | "archived";
  due_date: string | null;
  category: string | null;
  completed_at: string | null;
  created_at: string;
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
}

export interface RecoveryMetrics {
  id: string;
  date: string;
  avg_hrv: number | null;
  resting_hr: number | null;
  sleep_score: number | null;
  readiness: number | null;
  total_sleep_hrs: number | null;
  deep_hrs: number | null;
  rem_hrs: number | null;
  active_cal: number | null;
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
  content: string;
  created_at: string;
}

export interface Profile {
  id: string;
  key: string;
  value: string | null;
  updated_at: string;
}
