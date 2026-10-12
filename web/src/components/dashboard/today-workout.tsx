import Link from "next/link";
import { Dumbbell } from "lucide-react";
import EmptyState from "./empty-state";
import type { WorkoutExercise, WorkoutPlanStatus } from "@/lib/types";

export interface TodayWorkoutPlan {
  name: string | null;
  status: WorkoutPlanStatus;
  workout: WorkoutExercise[] | null;
}

const STATUS_NOTE: Record<WorkoutPlanStatus, string | null> = {
  planned: null,
  completed: "done",
  cancelled: "cancelled",
  skipped: "skipped",
};

/**
 * Today's workout_plans row, at a glance: the name, how many exercises, the first few of them,
 * and a link to the Fitness page where the set logger lives. The full plan (warm-up, supersets,
 * cues) stays on /fitness — this is the phone check-in, not the session.
 */
export default function TodayWorkout({ plan }: { plan: TodayWorkoutPlan | null }) {
  const exercises = plan?.workout ?? [];
  const note = plan ? STATUS_NOTE[plan.status] : null;

  return (
    <section>
      <h2 className="db-section-label">
        Today&apos;s workout
        {note && <span className="meta">· {note}</span>}
      </h2>

      {plan ? (
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--t-h2)",
              fontWeight: 500,
              color: plan.status === "planned" ? "var(--color-text)" : "var(--color-text-muted)",
            }}
          >
            {plan.name ?? "Planned session"}
          </p>
          {exercises.length > 0 && (
            <p
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--t-meta)",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
              }}
            >
              <span className="tnum">{exercises.length}</span>{" "}
              {exercises.length === 1 ? "exercise" : "exercises"} ·{" "}
              {exercises
                .slice(0, 3)
                .map((e) => e.exercise)
                .join(", ")}
              {exercises.length > 3 ? ", …" : ""}
            </p>
          )}
          <div style={{ marginTop: "var(--space-4)" }}>
            <Link href="/fitness" className="dash-action">
              {plan.status === "planned" ? "Open in Fitness" : "See Fitness"}
            </Link>
          </div>
        </div>
      ) : (
        <EmptyState icon={Dumbbell} paddingY={16} actionHref="/fitness" actionLabel="Fitness">
          Nothing scheduled today
        </EmptyState>
      )}
    </section>
  );
}
