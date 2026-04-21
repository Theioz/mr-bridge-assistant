import type { SupabaseClient } from "@supabase/supabase-js";

interface PRRow {
  user_id: string;
  exercise_name: string;
  weight_pr_kg: number | null;
  weight_pr_set_id: string | null;
  weight_pr_achieved_at: string | null;
  rep_pr_reps: number | null;
  rep_pr_weight_kg: number | null;
  rep_pr_achieved_at: string | null;
  volume_pr_kg: number | null;
  volume_pr_session_id: string | null;
  volume_pr_achieved_at: string | null;
  updated_at: string;
}

interface SetRow {
  id: string;
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
}

export async function upsertExercisePRs(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  const { data: session, error: sessionErr } = await supabase
    .from("strength_sessions")
    .select("id, performed_on, sets:strength_session_sets(id, exercise_name, weight_kg, reps)")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (sessionErr || !session) return;

  const sets = (session.sets ?? []) as SetRow[];
  const performedOn = session.performed_on as string;
  const achievedAt = performedOn + "T00:00:00Z";

  // Group sets by exercise name (lowercase key)
  const byExercise = new Map<string, { displayName: string; sets: SetRow[] }>();
  for (const s of sets) {
    const key = s.exercise_name.toLowerCase();
    const bucket = byExercise.get(key) ?? { displayName: s.exercise_name, sets: [] };
    bucket.sets.push(s);
    byExercise.set(key, bucket);
  }

  for (const { displayName, sets: exSets } of byExercise.values()) {
    // Compute session metrics
    let sessionWeightMax = 0;
    let weightPRSetId: string | null = null;
    let sessionRepMax = 0;
    let sessionRepMaxWeight: number | null = null;
    let sessionVolume = 0;

    for (const s of exSets) {
      const w = s.weight_kg ?? 0;
      const r = s.reps ?? 0;
      if (w > sessionWeightMax) {
        sessionWeightMax = w;
        weightPRSetId = s.id;
      }
      if (r > sessionRepMax) {
        sessionRepMax = r;
        sessionRepMaxWeight = s.weight_kg;
      }
      sessionVolume += w * r;
    }

    // Fetch existing PR row
    const { data: existing } = await supabase
      .from("exercise_prs")
      .select("*")
      .eq("user_id", userId)
      .eq("exercise_name", displayName)
      .maybeSingle();

    const row: PRRow = {
      user_id: userId,
      exercise_name: displayName,
      weight_pr_kg: existing?.weight_pr_kg ?? null,
      weight_pr_set_id: existing?.weight_pr_set_id ?? null,
      weight_pr_achieved_at: existing?.weight_pr_achieved_at ?? null,
      rep_pr_reps: existing?.rep_pr_reps ?? null,
      rep_pr_weight_kg: existing?.rep_pr_weight_kg ?? null,
      rep_pr_achieved_at: existing?.rep_pr_achieved_at ?? null,
      volume_pr_kg: existing?.volume_pr_kg ?? null,
      volume_pr_session_id: existing?.volume_pr_session_id ?? null,
      volume_pr_achieved_at: existing?.volume_pr_achieved_at ?? null,
      updated_at: new Date().toISOString(),
    };

    let changed = !existing;

    if (sessionWeightMax > 0 && sessionWeightMax > (row.weight_pr_kg ?? 0)) {
      row.weight_pr_kg = sessionWeightMax;
      row.weight_pr_set_id = weightPRSetId;
      row.weight_pr_achieved_at = achievedAt;
      changed = true;
    }
    if (sessionRepMax > 0 && sessionRepMax > (row.rep_pr_reps ?? 0)) {
      row.rep_pr_reps = sessionRepMax;
      row.rep_pr_weight_kg = sessionRepMaxWeight;
      row.rep_pr_achieved_at = achievedAt;
      changed = true;
    }
    if (sessionVolume > 0 && sessionVolume > (row.volume_pr_kg ?? 0)) {
      row.volume_pr_kg = sessionVolume;
      row.volume_pr_session_id = sessionId;
      row.volume_pr_achieved_at = achievedAt;
      changed = true;
    }

    if (changed) {
      await supabase
        .from("exercise_prs")
        .upsert(row, { onConflict: "user_id,exercise_name" });
    }
  }
}

export async function backfillAllPRs(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: sessions } = await supabase
    .from("strength_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("performed_on", { ascending: true });

  for (const session of sessions ?? []) {
    await upsertExercisePRs(supabase, userId, session.id);
  }

  return sessions?.length ?? 0;
}
