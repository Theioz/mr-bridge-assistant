import { createClient } from "@/lib/supabase/server";
import { backfillAllPRs } from "@/lib/fitness/compute-prs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await supabase
    .from("exercise_prs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count && count > 0) {
    return Response.json({ skipped: true, reason: "PRs already computed" });
  }

  const sessionCount = await backfillAllPRs(supabase, user.id);
  return Response.json({ ok: true, sessions_processed: sessionCount });
}
