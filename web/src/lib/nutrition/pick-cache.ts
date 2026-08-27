/**
 * Memo of "this food name -> that USDA record".
 *
 * Selecting a USDA entry costs a search plus a model call, and a kitchen cooks the same
 * fifteen foods over and over. Remembering the answer removes both calls on the second meal
 * — and, more importantly, PINS it: without a memo the same food can resolve to a different
 * record on a different day (different search ranking, an unconfident model, a timed-out
 * selection falling back to the top hit), which moves a meal's macros without the meal
 * changing. See supabase/migrations/20260827180000_usda_pick_cache.sql.
 *
 * EVERY function here fails soft. A cache is an optimisation, and an optimisation that can
 * fail a meal log is a liability — if the table is missing, the service key is wrong, or the
 * database is simply down, the caller must carry on and do the work the slow way.
 */

/**
 * One food name, one row.
 *
 * Without this, "Chicken Breast, Roasted " and "chicken breast, roasted" are two rows that
 * disagree, which reintroduces exactly the drift the table exists to remove. Trailing
 * punctuation goes too — the model is inconsistent about a closing period.
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.;:,\s]+$/, "")
    .trim();
}

export type CachedPick = { fdcId: number; description: string };

/**
 * The service client is imported LAZILY, on purpose.
 *
 * A static import makes this module unloadable under `node --test`, which resolves neither the
 * "@/" alias nor an extensionless relative path — so importing normalizeQuery (a pure string
 * function) would drag in the Supabase SDK and fail the whole test file. Deferring it also
 * means the cache costs nothing at module load in a request that never touches it.
 */
async function client() {
  const mod = await import("@/lib/supabase/service");
  return mod.createServiceClient();
}

/**
 * Look up many foods at once. Returns a map keyed by NORMALIZED query; a miss is simply absent.
 */
export async function lookupPicks(queries: string[]): Promise<Map<string, CachedPick>> {
  const found = new Map<string, CachedPick>();

  const keys = [...new Set(queries.map(normalizeQuery).filter(Boolean))];
  if (keys.length === 0) return found;

  try {
    const supabase = await client();
    const { data, error } = await supabase
      .from("usda_food_picks")
      .select("query, fdc_id, description")
      .in("query", keys);

    if (error || !data) return found;

    for (const row of data) {
      found.set(row.query, { fdcId: row.fdc_id, description: row.description });
    }
  } catch {
    // Fail soft — see the file header.
  }

  return found;
}

/**
 * Record what a food resolved to.
 *
 * Fire-and-forget by design: the estimate is already correct without this, so the caller must
 * never wait on it or fail because of it. `hits`/`last_used_at` are maintained so a stale or
 * suspicious mapping can be found later ("what has this learned, and when did it last matter").
 */
export async function recordPick(query: string, fdcId: number, description: string): Promise<void> {
  const key = normalizeQuery(query);
  if (!key || !Number.isInteger(fdcId) || fdcId <= 0) return;

  try {
    const supabase = await client();
    const { data } = await supabase
      .from("usda_food_picks")
      .select("hits")
      .eq("query", key)
      .maybeSingle();

    await supabase.from("usda_food_picks").upsert(
      {
        query: key,
        fdc_id: fdcId,
        description,
        hits: (data?.hits ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "query" },
    );
  } catch {
    // Fail soft — see the file header.
  }
}
