import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import { JOB_COLUMNS, newJob } from "@/lib/jobs/jobs";

/**
 * Add a role to the tracker by hand: { company, title, url?, status?, fit?, level?, notes?, ... }.
 * Status defaults to to_apply. The session client's RLS scopes the row to the signed-in user.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let row;
  try {
    row = newJob(await req.json(), todayString());
  } catch (err) {
    const msg = err instanceof SyntaxError ? "Invalid JSON" : (err as Error).message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...row, user_id: user.id })
    .select(JOB_COLUMNS)
    .single();
  if (error) {
    // 23505 = the posting url is already tracked or was seen by Job Scout
    if (error.code === "23505")
      return NextResponse.json({ error: "That posting is already in Jobs" }, { status: 409 });
    console.error("[POST /api/jobs]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ job: data });
}
