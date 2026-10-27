import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import { feedbackUpdate, JOB_COLUMNS, trackerPatch } from "@/lib/jobs/jobs";

/**
 * Edit one role. Two kinds of body, both may be sent at once:
 *   - Job Scout feedback: { feedback: "want" | "not_for_me" | "wrong_reason" | null, note? } —
 *     re-queues the row for tomorrow's inbox (feedback_sent_at -> null).
 *   - Tracker fields: { status?, fit?, level?, notes?, date_applied?, date_rejected?, ... } —
 *     moving to applied/rejected stamps today's date when none is set.
 * The session client's RLS scopes the row to the signed-in user.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("jobs")
    .select("date_applied, date_rejected")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[PATCH /api/jobs/[id]] read", readError);
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  let update: Record<string, unknown> = {};
  try {
    const { feedback, note, ...rest } = body;
    if ("feedback" in body)
      update = { ...feedbackUpdate({ feedback, note }, new Date().toISOString()) };
    if (Object.keys(rest).length)
      update = { ...update, ...trackerPatch(rest, existing, todayString()) };
    if (!Object.keys(update).length) throw new Error("Nothing to update");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(JOB_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505")
      return NextResponse.json(
        { error: "Another role already has that posting url" },
        { status: 409 },
      );
    console.error("[PATCH /api/jobs/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ job: data });
}
