// Declarative registry of tables included in the user-facing data export.
//
// Deliberately excluded (#67):
//   - chat_sessions / chat_messages  — interaction state, not user-authored content
//   - user_equipment                 — app config, not portable data
//   - notifications                  — ephemeral (30-day TTL)
//   - packages                       — derived from scraped Gmail
//   - stocks_cache / sports_cache    — provider caches
//   - user_integrations              — pgp_sym_encrypt'd OAuth refresh tokens
//   - sync_log                       — internal observability

export type ExportTable = {
  name: string;
  columns: string[];
  dateColumn: string | null;
  fileBasename: string;
  scopedByRls: boolean;
};

export const EXPORT_TABLES: ExportTable[] = [
  {
    name: "tasks",
    fileBasename: "tasks",
    dateColumn: "created_at",
    scopedByRls: false,
    columns: [
      "id",
      "title",
      "priority",
      "status",
      "due_date",
      "category",
      "completed_at",
      "created_at",
      "parent_id",
      "metadata",
    ],
  },
  {
    name: "habits",
    fileBasename: "habits",
    dateColumn: "date",
    scopedByRls: false,
    columns: ["id", "habit_id", "date", "completed", "notes", "metadata"],
  },
  {
    name: "habit_registry",
    fileBasename: "habit_registry",
    dateColumn: null,
    scopedByRls: false,
    columns: ["id", "name", "emoji", "category", "icon_key", "active", "created_at", "metadata"],
  },
  {
    name: "fitness_log",
    fileBasename: "fitness_log",
    dateColumn: "date",
    scopedByRls: false,
    columns: [
      "id",
      "date",
      "weight_lb",
      "body_fat_pct",
      "bmi",
      "muscle_mass_lb",
      "visceral_fat",
      "source",
      "metadata",
    ],
  },
  {
    name: "workout_sessions",
    fileBasename: "workout_sessions",
    dateColumn: "date",
    scopedByRls: false,
    columns: [
      "id",
      "date",
      "start_time",
      "activity",
      "duration_mins",
      "calories",
      "avg_hr",
      "notes",
      "source",
      "metadata",
    ],
  },
  {
    name: "recovery_metrics",
    fileBasename: "recovery_metrics",
    dateColumn: "date",
    scopedByRls: false,
    columns: [
      "id",
      "date",
      "bedtime",
      "total_sleep_hrs",
      "deep_hrs",
      "rem_hrs",
      "light_hrs",
      "awake_hrs",
      "sleep_efficiency",
      "vo2_max",
      "avg_hrv",
      "resting_hr",
      "readiness",
      "sleep_score",
      "active_cal",
      "steps",
      "activity_score",
      "spo2_avg",
      "body_temp_delta",
      "source",
      "metadata",
    ],
  },
  {
    name: "recipes",
    fileBasename: "recipes",
    dateColumn: "created_at",
    scopedByRls: false,
    columns: [
      "id",
      "name",
      "cuisine",
      "ingredients",
      "instructions",
      "tags",
      "created_at",
      "metadata",
    ],
  },
  {
    name: "meal_log",
    fileBasename: "meal_log",
    dateColumn: "date",
    scopedByRls: false,
    columns: [
      "id",
      "date",
      "meal_type",
      "recipe_id",
      "notes",
      "user_context",
      "calories",
      "protein_g",
      "carbs_g",
      "fat_g",
      "fiber_g",
      "sugar_g",
      "sodium_mg",
      "source",
      "metadata",
    ],
  },
  {
    name: "profile",
    fileBasename: "profile",
    dateColumn: null,
    scopedByRls: false,
    columns: ["id", "key", "value", "updated_at"],
  },
  {
    name: "study_log",
    fileBasename: "study_log",
    dateColumn: "date",
    scopedByRls: false,
    columns: ["id", "date", "subject", "duration_mins", "notes", "metadata"],
  },
  {
    name: "journal_entries",
    fileBasename: "journal_entries",
    dateColumn: "date",
    scopedByRls: false,
    columns: ["id", "date", "responses", "free_write", "created_at", "updated_at", "metadata"],
  },
  {
    name: "workout_plans",
    fileBasename: "workout_plans",
    dateColumn: "date",
    scopedByRls: false,
    columns: [
      "id",
      "date",
      "name",
      "warmup",
      "workout",
      "cooldown",
      "notes",
      "status",
      "cancel_reason",
      "cancelled_at",
      "calendar_event_id",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "strength_sessions",
    fileBasename: "strength_sessions",
    dateColumn: "performed_on",
    scopedByRls: false,
    columns: [
      "id",
      "workout_plan_id",
      "performed_on",
      "started_at",
      "completed_at",
      "perceived_effort",
      "notes",
      "created_at",
    ],
  },
  {
    // No user_id column — scoped via RLS (EXISTS join on strength_sessions.user_id = auth.uid()).
    name: "strength_session_sets",
    fileBasename: "strength_session_sets",
    dateColumn: "created_at",
    scopedByRls: true,
    columns: [
      "id",
      "session_id",
      "exercise_name",
      "exercise_order",
      "set_number",
      "weight_kg",
      "reps",
      "rpe",
      "completed",
      "notes",
      "created_at",
    ],
  },
  {
    name: "exercise_prs",
    fileBasename: "exercise_prs",
    dateColumn: null,
    scopedByRls: false,
    columns: [
      "id",
      "exercise_name",
      "weight_pr_kg",
      "rep_pr_reps",
      "rep_pr_weight_kg",
      "volume_pr_kg",
      "weight_pr_set_id",
      "volume_pr_session_id",
      "weight_pr_achieved_at",
      "volume_pr_achieved_at",
      "rep_pr_achieved_at",
      "updated_at",
    ],
  },
];

export type ExportRange = "all" | "30d" | "90d" | "1y";

export function rangeToSinceIso(range: ExportRange): string | null {
  if (range === "all") return null;
  const now = Date.now();
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
