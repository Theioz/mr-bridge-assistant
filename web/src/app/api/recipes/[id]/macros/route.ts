import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveRecipeMacros } from "@/lib/nutrition/recipe-macros";

/**
 * Resolve a recipe's ingredients into measured macros via the USDA pipeline.
 *
 * POST because it is expensive (a local-model parse plus one FDC lookup per ingredient)
 * and it writes. It is idempotent in effect — re-running simply recomputes — so it is
 * safe to call again after the ingredient list is edited.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    const macros = await resolveRecipeMacros(db, user.id, id);

    // No ingredient text is a normal state, not a failure: the restaurant-style recipes
    // have none. Say so plainly rather than 500-ing.
    if (!macros) {
      return NextResponse.json({
        resolved: false,
        reason: "Recipe has no ingredient list — add one to compute macros",
      });
    }

    return NextResponse.json({ resolved: true, ...macros });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Macro resolution failed";
    if (msg.includes("not found")) return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[/api/recipes/[id]/macros]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
