import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return NextResponse.json({ ok: false, reason: "NTFY_TOPIC unset" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title : "Mr. Bridge";
  const message = typeof body?.message === "string" ? body.message : "";

  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: title, "Content-Type": "text/plain" },
      body: message,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
