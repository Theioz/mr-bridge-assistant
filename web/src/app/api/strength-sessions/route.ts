import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import { upsertExercisePRs } from "@/lib/fitness/compute-prs";

interface LogSetBody {
  performed_on?: string;
  workout_plan_id?: string | null;
  exercise_name: string;
  exercise_order: number;
  set_number: number;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
}

interface RecapBody {
  session_id: string;
  perceived_effort?: number | null;
  notes?: string | null;
  completed_at?: string;
}

export async function POST(req: Request) {
  let body: LogSetBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.exercise_name || typeof body.exercise_name !== "string") {
    return Response.json({ error: "exercise_name is required" }, { status: 400 });
  }
  if (!Number.isFinite(body.exercise_order) || !Number.isFinite(body.set_number)) {
    return Response.json({ error: "exercise_order and set_number must be numbers" }, { status: 400 });
  }
  if (body.rpe != null && (body.rpe < 1 || body.rpe > 10)) {
    return Response.json({ error: "rpe must be between 1 and 10" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const performedOn = body.performed_on ?? todayString();

  const { data: existing, error: lookupErr } = await supabase
    .from("strength_sessions")
    .select("id, started_at, workout_plan_id")
    .eq("user_id", user.id)
    .eq("performed_on", performedOn)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupErr) return Response.json({ error: lookupErr.message }, { status: 500 });

  let sessionId: string;
  if (existing) {
    sessionId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("strength_sessions")
      .insert({
        user_id: user.id,
        workout_plan_id: body.workout_plan_id ?? null,
        performed_on: performedOn,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return Response.json({ error: createErr?.message ?? "failed to create session" }, { status: 500 });
    }
    sessionId = created.id;
  }

  const { data: setRow, error: setErr } = await supabase
    .from("strength_session_sets")
    .insert({
      session_id: sessionId,
      exercise_name: body.exercise_name.trim(),
      exercise_order: Math.round(body.exercise_order),
      set_number: Math.round(body.set_number),
      weight_kg: body.weight_kg ?? null,
      reps: body.reps ?? null,
      rpe: body.rpe ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (setErr) return Response.json({ error: setErr.message }, { status: 500 });

  return Response.json({ session_id: sessionId, set: setRow }, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: RecapBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.session_id) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }
  if (body.perceived_effort != null && (body.perceived_effort < 1 || body.perceived_effort > 10)) {
    return Response.json({ error: "perceived_effort must be between 1 and 10" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: Record<string, unknown> = {
    completed_at: body.completed_at ?? new Date().toISOString(),
  };
  if (body.perceived_effort !== undefined) updates.perceived_effort = body.perceived_effort;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from("strength_sessions")
    .update(updates)
    .eq("id", body.session_id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Session not found" }, { status: 404 });

  // Fire-and-forget PR computation on session completion
  upsertExercisePRs(supabase, user.id, body.session_id).catch(() => {});

  return Response.json(data);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const setId = url.searchParams.get("set_id");
  if (!setId) return Response.json({ error: "set_id query param is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("strength_session_sets")
    .delete()
    .eq("id", setId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
