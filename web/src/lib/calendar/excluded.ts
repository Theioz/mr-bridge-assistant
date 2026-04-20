import type { SupabaseClient } from "@supabase/supabase-js";

// Returns the set of Google Calendar IDs the owner wants skipped from every
// Bridge read path (briefing, dashboard Schedule Today, list_calendar_events
// chat tool). Stored in `profile` as key `excluded_calendar_ids` with a
// JSON-string array value. Empty / missing / malformed → empty set (fail open
// so a schema slip doesn't blank out the entire schedule).
export async function getExcludedCalendarIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("profile")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "excluded_calendar_ids")
    .maybeSingle();
  if (!data?.value) return new Set();
  try {
    const parsed = JSON.parse(data.value);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}
