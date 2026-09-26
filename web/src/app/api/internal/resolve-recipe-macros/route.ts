import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveRecipeMacros } from "@/lib/nutrition/recipe-macros";

/**
 * Backfill recipe macros through the USDA pipeline.
 *
 * The user-facing route (POST /api/recipes/[id]/macros) needs a browser session, which makes
 * it useless for a bulk backfill or for a scheduled re-resolve. This is the same operation
 * behind the CRON_SECRET + OWNER_USER_ID pattern already used by /api/internal/plan.
 *
 * Resolution is expensive (a local-model parse plus an FDC lookup per ingredient) and hits
 * Ollama, so recipes are done SEQUENTIALLY. Parallelising this would just queue up behind
 * the single model server and risk timing the request out.
 *
 * Idempotent: recipes that already have macros are skipped unless ?force=1.
 *
 * `?id=<uuid>` (repeatable) resolves EXACTLY those recipes, resolved or not, and touches nothing
 * else. Without it the only way to re-resolve one recipe was to clear its stamp — which the
 * `macros_computed_at` trigger rightly refuses while macros are set, so it also meant blanking its
 * macros — and then fence every other unstamped row (the `Eating out` placeholder) so the bulk
 * pass would not price it. ?force=1 is the other option, and it re-resolves the whole library.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = process.env.OWNER_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });
  }

  const ids = request.nextUrl.searchParams.getAll("id");
  if (ids.some((id) => !UUID.test(id))) {
    return NextResponse.json({ error: "id must be a recipe uuid" }, { status: 400 });
  }
  // Naming a recipe is an explicit request to resolve it, so it implies force for that recipe.
  const force = ids.length > 0 || request.nextUrl.searchParams.get("force") === "1";

  const db = createServiceClient();
  let query = db
    .from("recipes")
    .select("id, name, ingredients, ingredients_json, macros_computed_at")
    .eq("user_id", userId)
    .order("name");
  if (ids.length) query = query.in("id", ids);
  const { data: recipes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A named id that matched nothing is an error the caller must see, not an empty success.
  const missing = ids.filter((id) => !(recipes ?? []).some((r) => r.id === id.toLowerCase()));
  if (missing.length) {
    return NextResponse.json({ error: `no such recipe: ${missing.join(", ")}` }, { status: 404 });
  }

  const resolved: unknown[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const r of recipes ?? []) {
    const name = r.name as string;

    // Either form counts: a structured-only recipe (ingredients_json, no text) is resolvable, and
    // used to be skipped here as "no ingredient list".
    const hasStructured =
      Array.isArray(r.ingredients_json) && (r.ingredients_json as unknown[]).length > 0;
    if (!hasStructured && !(r.ingredients as string | null)?.trim()) {
      // Normal, not a failure: the restaurant-style recipes have no ingredient list. They
      // simply can't be meal-planned, and stay loggable via the photo analyzer.
      skipped.push({ name, reason: "no ingredient list" });
      continue;
    }
    if (r.macros_computed_at && !force) {
      skipped.push({ name, reason: "already resolved" });
      continue;
    }

    try {
      const macros = await resolveRecipeMacros(db, userId, r.id as string);
      resolved.push({
        name,
        ...macros?.total,
        // The working, not just the answer — which USDA record each ingredient matched and
        // how its grams were derived. This is what makes a wrong total findable.
        unquantified: macros?.unquantified ?? [],
        items: macros?.items ?? [],
      });
    } catch (e) {
      failed.push({ name, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    resolved: resolved.length,
    skipped: skipped.length,
    failed: failed.length,
    details: { resolved, skipped, failed },
  });
}
