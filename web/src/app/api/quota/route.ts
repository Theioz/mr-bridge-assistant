import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Local row type until Supabase types are regenerated after the migration lands.
interface TenantQuotaRow {
  daily_chat_tokens: number;
  daily_tool_calls: number;
  tokens_used_today: number;
  tool_calls_used_today: number;
  daily_chat_tokens_override: number | null;
  daily_tool_calls_override: number | null;
  daily_demo_turns: number;
  demo_turns_used_today: number;
  last_reset: string;
}

// Default caps match the migration defaults so a brand-new user (no row yet)
// sees "0 / cap" instead of an empty state. The row is lazily created on first
// chat request via check_and_increment_quota's INSERT … ON CONFLICT DO NOTHING.
const DEFAULTS: TenantQuotaRow = {
  daily_chat_tokens: 500000,
  daily_tool_calls: 500,
  tokens_used_today: 0,
  tool_calls_used_today: 0,
  daily_chat_tokens_override: null,
  daily_tool_calls_override: null,
  daily_demo_turns: 50,
  demo_turns_used_today: 0,
  last_reset: new Date().toISOString().slice(0, 10),
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const demoUserId = process.env.DEMO_USER_ID ?? null;
  const isDemo = !!(demoUserId && user.id === demoUserId);

  const { data, error } = await supabase
    .from("tenant_quotas")
    .select(
      "daily_chat_tokens, daily_tool_calls, tokens_used_today, tool_calls_used_today, " +
        "daily_chat_tokens_override, daily_tool_calls_override, " +
        "daily_demo_turns, demo_turns_used_today, last_reset",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cast to our local type until Supabase codegen is re-run post-migration.
  const row: TenantQuotaRow = (data as TenantQuotaRow | null) ?? DEFAULTS;

  // Compute next UTC midnight as resets_at
  const [y, m, d] = row.last_reset.split("-").map(Number);
  const resetsAt = new Date(Date.UTC(y, m - 1, d + 1)).toISOString();

  return NextResponse.json({
    is_demo: isDemo,
    chat: {
      tokens_used: row.tokens_used_today,
      tokens_cap: row.daily_chat_tokens_override ?? row.daily_chat_tokens,
      tool_calls_used: row.tool_calls_used_today,
      tool_calls_cap: row.daily_tool_calls_override ?? row.daily_tool_calls,
    },
    demo: {
      turns_used: row.demo_turns_used_today,
      turns_cap: row.daily_demo_turns,
    },
    resets_at: resetsAt,
  });
}
