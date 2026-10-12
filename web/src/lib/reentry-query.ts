import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReentry, type ReentrySignal } from "./reentry";

/**
 * The hand-entered tables and the date column each one is keyed on. See lib/reentry.ts for why
 * synced tables are excluded.
 */
const HAND_ENTERED: ReadonlyArray<{ table: string; column: string }> = [
  { table: "meal_log", column: "date" },
  { table: "habits", column: "date" },
  { table: "strength_sessions", column: "performed_on" },
  { table: "journal_entries", column: "date" },
];

/**
 * Newest date from each hand-entered table, folded into one ReentrySignal.
 *
 * `userId` is optional because the two callers differ: the dashboard reads through the RLS
 * client (rows are already scoped), the MCP tool uses the service client and must filter.
 * A table that fails to load counts as "no rows" for that table — the other three still answer,
 * and the worst case is a calm card shown a day early, never a write.
 */
export async function getHandLoggingSignal(
  db: SupabaseClient,
  today: string,
  userId?: string,
): Promise<ReentrySignal> {
  const latest = await Promise.all(
    HAND_ENTERED.map(async ({ table, column }) => {
      let q = db.from(table).select(column).lte(column, today);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q.order(column, { ascending: false }).limit(1);
      if (error || !data?.length) return null;
      return ((data[0] as unknown as Record<string, unknown>)[column] as string | null) ?? null;
    }),
  );
  return computeReentry(latest, today);
}
